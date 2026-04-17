# WS-5 — Source Expansion Beyond LinkedIn

**Scope**: Add structured ingestion from Wayback Machine, SEC EDGAR, RSS-sourced press releases, news articles, corporate blogs, and podcast appearance transcripts. Every source becomes a `source_records` row and feeds into the same evidence model as LinkedIn captures.
**Non-scope**: Paid data providers this sprint (Apollo / Lusha / PDL already exist via enrichment waterfall — not touched). Full-text indexing across all sources (out of scope for parser sprint; `pgvector` is available for future semantic search). Non-English news. Automatic fact extraction — the user still chooses what to snip.
**Depends on**: WS-3 (snippets attach to source records), WS-4 (ingestion runs scoped to a target), existing ExoChain from `026-ecc-exo-chain.sql`.

---

## 1. Intent

The user described investigative research that joins Wayback snapshots, press releases, and SEC filings against LinkedIn capture data. That pattern — "find the thing LinkedIn forgot by looking at what LinkedIn couldn't edit" — only works if the other sources are in the same database. This WS makes them first-class.

Source types in scope:

1. **Wayback Machine** — historical snapshots of LinkedIn profiles, company pages, corporate team pages.
2. **SEC EDGAR** — 10-K, 10-Q, 8-K, DEF 14A (proxy), 13F filings.
3. **Press releases** — RSS-first (Business Wire, PR Newswire, Globe Newswire).
4. **News articles** — RSS + targeted scrape for publications with RSS feeds (WSJ, Bloomberg, TechCrunch, industry trades).
5. **Corporate blogs** — RSS.
6. **Podcast transcripts** — Listen Notes / podcast RSS + user-uploaded transcript files.

These are the six the user named. We set up a pluggable connector interface so adding a seventh source later is a new file and a row in a registry, not a schema change.

## 2. Architectural spine — `source_records`

One table to rule them all:

```
CREATE TABLE source_records (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id),
  source_type    TEXT NOT NULL,                   -- 'wayback', 'edgar', 'rss', 'news', 'blog', 'podcast'
  source_id      TEXT NOT NULL,                   -- stable external id (EDGAR accession, Wayback timestamp+url, RSS guid)
  canonical_url  TEXT NOT NULL,                   -- normalized URL for display
  title          TEXT,
  published_at   TIMESTAMPTZ,                     -- when the source says it was published
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  content_hash   BYTEA NOT NULL,                  -- SHA-256 of fetched body
  content_bytes  INTEGER NOT NULL,
  content        BYTEA,                           -- raw body; nullable for large docs stored externally
  content_mime   TEXT,
  metadata       JSONB NOT NULL DEFAULT '{}',     -- source-specific structure
  status         TEXT NOT NULL DEFAULT 'fetched', -- 'pending' | 'fetched' | 'failed' | 'stale'
  CONSTRAINT uq_source_records_dedup UNIQUE (tenant_id, source_type, source_id)
);
CREATE INDEX ix_source_records_canonical_url ON source_records(tenant_id, canonical_url);
CREATE INDEX ix_source_records_published ON source_records(tenant_id, source_type, published_at DESC);
```

Every ingested document lands here. Dedup is the `(tenant_id, source_type, source_id)` unique constraint — the connector knows how to form a stable `source_id` per source type (§§4–9).

### 2.1 Related: `source_record_entities`

```
CREATE TABLE source_record_entities (
  source_record_id UUID NOT NULL REFERENCES source_records(id) ON DELETE CASCADE,
  entity_kind      TEXT NOT NULL,                 -- 'contact' | 'company'
  entity_id        UUID NOT NULL,
  role             TEXT NOT NULL,                 -- 'subject' | 'mentioned' | 'issuer' | 'author'
  confidence       REAL NOT NULL DEFAULT 1.0,
  extracted_by     TEXT NOT NULL,                 -- 'connector-rule' | 'user-link' | 'llm-future'
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (source_record_id, entity_kind, entity_id, role)
);
```

Connectors populate this automatically for high-confidence matches (e.g. EDGAR subject company from the filer CIK; Wayback subject contact from the URL path). Lower-confidence mentions become candidates the user can confirm from the snippet widget (WS-3 §5).

### 2.2 Content storage — inline vs. external

For now all content goes inline in `source_records.content` bytea. Limits:

- `content_bytes` ≤ 5 MB. If the source is larger (10-K filings can hit 50+ MB), the connector stores only a canonical excerpt + structured metadata, and sets `status='stored_partial'`.
- At the quota boundary we lean on PostgreSQL TOAST — bytea out-of-line storage is automatic.
- A future-work item (flagged in §16) is to move large content to object storage and replace `content` with a URL.

### 2.3 Relationship to `causal_nodes`

`source_records` is **not** a causal_nodes row. Source records are data; causal_nodes are events about data.

When a snippet references a source (WS-3 §3), the edge `cited_from` connects the snippet's causal_node to the source_record via the snippet node's `inputs.source_record_id`. We can later add a dedicated `causal_node` for a source-fetched event (operation='fetch_source') if we want enrichment-style provenance — an easy additive step.

## 3. Connector interface

```typescript
// app/src/lib/sources/types.ts
export interface SourceConnector {
  readonly sourceType: string;                    // 'wayback' | 'edgar' | ...
  readonly label: string;                         // human-readable

  /** Resolve arbitrary user input to a canonical fetch target. */
  resolve(input: SourceResolveInput): Promise<SourceResolveResult>;

  /** Fetch the canonical artifact and populate a source_records row. */
  fetch(target: SourceResolveResult, ctx: SourceContext): Promise<SourceFetchResult>;

  /** Optionally produce derived entity links on fetch. */
  extractEntities(record: SourceRecord, ctx: SourceContext): Promise<SourceEntityLink[]>;
}

export interface SourceResolveInput {
  url?: string;
  identifier?: string;                             // source-specific
  queryEntity?: { kind: 'contact' | 'company'; id: string; };
}

export interface SourceResolveResult {
  sourceType: string;
  sourceId: string;                                // stable across re-resolves
  canonicalUrl: string;
  expectedTitle?: string;
  publishedAt?: string;
}

export interface SourceContext {
  tenantId: string;
  userId: string | null;
  targetId: string | null;                         // if invoked inside a research session
}

export interface SourceFetchResult {
  sourceRecordId: string;                          // after INSERT
  isNew: boolean;
  bytes: number;
}

export interface SourceEntityLink {
  entityKind: 'contact' | 'company';
  entityId: string;
  role: string;
  confidence: number;
}
```

Each connector is a single file under `app/src/lib/sources/connectors/`. A registry module exports them all:

```typescript
// app/src/lib/sources/registry.ts
import { waybackConnector } from './connectors/wayback';
import { edgarConnector } from './connectors/edgar';
import { rssConnector } from './connectors/rss';
import { newsConnector } from './connectors/news';
import { blogConnector } from './connectors/blog';
import { podcastConnector } from './connectors/podcast';

export const connectors: Record<string, SourceConnector> = {
  wayback: waybackConnector,
  edgar: edgarConnector,
  rss: rssConnector,
  news: newsConnector,
  blog: blogConnector,
  podcast: podcastConnector,
};
```

## 4. Wayback Machine connector

### 4.1 Resolve

Input: any URL (typically a LinkedIn profile or company URL the user already captured today). Optional: a `timestamp` in `YYYYMMDDHHMMSS` format.

Resolution calls the Wayback Availability API: `https://archive.org/wayback/available?url=<encoded>&timestamp=<ts>` and returns the nearest snapshot.

`source_id = <14-digit wayback timestamp>:<normalized url>`

### 4.2 Fetch

GET the Wayback URL (`https://web.archive.org/web/<timestamp>/<url>`). Store the HTML. If the snapshot's page type is known to the LinkedIn parsers (PROFILE, COMPANY), **also** pass the HTML through the active parser configs as a `page_cache` row (with a new `source='wayback'` column we add — schema change documented in `07-architecture-and-schema.md`). The result is: a historical LinkedIn capture, parsed with the same parsers, produces contact / company / work_history deltas the user can see against the present.

### 4.3 Extract entities

For a Wayback-of-LinkedIn snapshot, the slug in the URL path identifies the contact (`/in/<slug>`) or company (`/company/<slug>`). The connector matches against existing `contacts` / `companies` via normalized URL. Confidence 0.95 on match; unmatched URLs produce no link (user can snip and link manually).

### 4.4 Use cases addressed

- "Was Jane Doe listed as AI Director on the company team page in 2024?" — user snips that Wayback capture page, the connector has stored it, the departure date is automatically inferable from absence in later captures.
- "How did the company headline change over 18 months?" — with Wayback captures of the company page across time, the diff computation from WS-2 has data to walk.

## 5. SEC EDGAR connector

### 5.1 Resolve

Input: a company name OR a CIK OR an EDGAR URL. Resolution uses the free submissions API: `https://data.sec.gov/submissions/CIK<10-digit>.json`.

`source_id = <accession number>` (globally unique in EDGAR).

### 5.2 Fetch

For each filing of interest (10-K, 10-Q, 8-K, DEF 14A, 13F), fetch the submission index and the primary document. Primary documents are often HTML; store the rendered text plus the original HTML, capped at §2.2's 5 MB — for 10-Ks we store only the "Item 1A Risk Factors", "Item 7 MD&A", and "Item 10 Directors and Executive Officers" sections by default. `metadata` captures the filing type, accession number, filer name, filing date, period of report.

### 5.3 Extract entities

- Subject company: matched against `companies` by CIK (store CIK on companies as a new nullable column) or by exact name match.
- Executives mentioned in Item 10 / DEF 14A tables: rule-based extraction of name + title from the Officers & Directors table. Confidence 0.8 for exact name matches, 0.6 for fuzzy.

### 5.4 Rate limits

SEC enforces 10 requests/second per IP and requires a User-Agent header with a contact email. We comply and fetch sequentially with a token-bucket limiter. Violations ban the IP — this is a hard constraint.

### 5.5 Seed behavior

When a user sets a company as target for the first time, if the company has a known CIK, enqueue a backfill of the last 2 years of 10-K, 10-Q, 8-K filings.

## 6. RSS connector (press releases + blogs)

### 6.1 Intent

Press releases and corporate blogs overwhelmingly publish via RSS/Atom. The same connector handles both.

### 6.2 Resolve

Input: a feed URL. Optional: a subscription name.

Persistent config in new `source_feeds` table:

```
source_feeds (
  id uuid primary key,
  tenant_id uuid,
  source_type text,           -- 'rss'
  feed_url text not null,
  feed_kind text,             -- 'press_release' | 'blog' | 'news'
  label text,
  last_fetched_at timestamptz,
  last_success_at timestamptz,
  last_etag text,
  last_modified text,
  created_at timestamptz default now(),
  unique (tenant_id, feed_url)
)
```

`source_id = <feed_url>::<rss_item_guid>`

### 6.3 Fetch

Standard RSS polling loop. Respect `ETag` / `Last-Modified`. Fetch body of each new item; store title, author, published_at, full text. For items longer than 5 MB, chunk and store first 5 MB (covers every press release we'll see).

Cadence: poll every 30 minutes by default; configurable per feed.

### 6.4 Extract entities

- Primary subject company: match `feed_kind='press_release'` items by "Issued by <Company>" heuristics + `metadata.issuer`.
- Primary author: `feed_kind='blog'` items extract author from `<author>` / `<dc:creator>` and try to resolve to a contact.
- Mentioned entities: only at confidence 0.5 via simple name regex; the rest left to user snip workflow.

## 7. News connector

### 7.1 Intent

News is RSS where possible (most major publications), with careful targeted scraping where not.

### 7.2 Approach

- Priority 1: RSS. Use the RSS connector under the hood, tagged `feed_kind='news'`.
- Priority 2: Google News RSS (`https://news.google.com/rss/search?q=<company>`) for targets without a direct feed.
- Priority 3: A targeted scraper per domain for the top 5 publications (WSJ, Bloomberg, Reuters, TechCrunch, CNBC). Each is a 40-line file in `app/src/lib/sources/scrapers/`. Scrapers respect robots.txt (parse and enforce) and rate-limit at 1 req/3s per domain.

### 7.3 Entity extraction

- Company mentioned in title → high confidence.
- People named in the lede paragraph → candidate mentions.
- Inline links to LinkedIn URLs → direct resolution.

## 8. Podcast connector

### 8.1 Intent

Podcast episodes mentioning targets are valuable, especially when transcripts are available.

### 8.2 Resolution

Input: a podcast RSS feed URL or a Listen Notes search query.

For each episode:
- Fetch enclosure URL for audio (if user wants to listen; we don't transcribe here).
- If a transcript is available (from the feed's `<podcast:transcript>` tag or a user-provided text file), store it.
- Otherwise store episode metadata only — title, description, participants (often in show notes).

### 8.3 Entity extraction

- Host(s) from the feed's owner element.
- Guest identification from episode title regex (`Episode N: <Guest Name> on ...`) or show-notes parsing.

Transcripts are the high-value case; without them, podcasts are metadata-only records users can snip manually.

## 9. Blog connector

### 9.1 Intent

Corporate blogs hosted on Medium, Substack, or standalone CMSes.

### 9.2 Approach

RSS where available (covers 80%+). For standalone blogs without RSS, a lightweight sitemap-scraping path that fetches `/sitemap.xml`, extracts blog post URLs, and fetches each. Cadence: daily.

### 9.3 Entity extraction

- Author → contact.
- Mentioned people (via capitalized-bigram regex) → candidates.

## 10. User-facing UI

### 10.1 Sources page

`/sources` — admin page listing configured feeds, connectors, and recently-ingested records. Table shows source type, title, subject (linked if resolved), published_at.

### 10.2 Per-target source panel

On a contact/company page (scoped by target model from WS-4), a new "Sources" panel lists `source_records` with an entity link matching the target, grouped by source type, ordered by `published_at DESC`.

Each row links to a source viewer that renders the stored content with extraction highlights.

### 10.3 Ingestion UX

- "Fetch Wayback history for this LinkedIn URL" button on any contact/company page (invokes Wayback connector with the page's URL).
- "Add RSS feed" dialog in the Sources page.
- "Fetch SEC filings" button on a company page (invokes EDGAR connector with the company's CIK).
- Auto-seed: setting a company as primary target for the first time schedules EDGAR backfill (§5.5) + a Google News Alerts subscription.

## 11. Rate limiting and robots

One shared rate-limiter service per external domain, not per connector:

```typescript
// app/src/lib/sources/rate-limit.ts
export class PerHostRateLimiter {
  async acquire(host: string): Promise<void>;
  register(host: string, config: { rps: number; concurrency: number; }): void;
}
```

Defaults:

| Host | RPS | Concurrency |
|------|-----|-------------|
| `web.archive.org` | 0.5 | 1 |
| `data.sec.gov` | 10 | 5 |
| `www.sec.gov` | 10 | 5 |
| `news.google.com` | 1 | 1 |
| *other* | 0.33 | 1 |

Every fetch passes a User-Agent including `Network Navigator research tool; contact: <tenant email>`.

robots.txt is respected for all non-API domains. A small library (reuse `robots-parser` npm package if already present, else build ourselves; a minimalist parse is 80 LOC).

## 12. Dedup strategy summary

| Source type | source_id formation | Dedup rationale |
|-------------|---------------------|-----------------|
| Wayback | `<timestamp>:<normalized_url>` | Each snapshot is unique by time; same URL at a different time is a different record. |
| EDGAR | accession number | Globally unique in EDGAR. |
| RSS | `<feed_url>::<guid>` | RSS guids are unique per feed by spec. |
| News (Google News RSS) | same as RSS, feed url is Google News URL | Same. |
| News (targeted scrape) | `<domain>:<canonical_url>` | Canonicalize URL to strip tracking params. |
| Blog (RSS) | same as RSS | Same. |
| Blog (sitemap) | `<domain>:<path>` | Canonicalize. |
| Podcast | `<feed_url>::<guid>` or `<listen_notes_episode_id>` | Stable per source. |

When the same record is discoverable via two paths (e.g. an article syndicated to RSS and appearing in Google News RSS), dedup falls through content_hash as a secondary check. On content_hash match across source_ids, the older record is kept and the newer ingestion is logged as a duplicate with its originating source_id retained in `metadata.duplicate_of_source_ids[]`.

## 13. When multiple sources disagree

Three dimensions of disagreement. Policy per dimension.

### 13.1 Temporal (same fact, different timestamps)

Example: LinkedIn says Jane is VP Eng; a press release says Jane joined as VP Eng on 2023-06-01; Wayback snapshot from 2022-06 still shows Jane as Sr Eng.

Policy: timestamps win. Each fact has a `referenced_date` (from the source metadata). The contact projection (§§WS-2.4) picks the value from the most recent referenced_date. Older values appear in a "history" row.

### 13.2 Contradictory (same timestamp, different values)

Example: press release issued 2023-06-01 says Jane is "VP Engineering"; EDGAR filing same month lists her as "VP, Technology".

Policy: source trust ordering, configurable per tenant. Default: `edgar > press_release > news > linkedin > blog > podcast > wayback`. (EDGAR wins because filings are legally attested.)

On conflict, both values are kept in the projection with attribution: `title: "VP, Technology" (edgar) / "VP Engineering" (press_release)`. The UI shows both with source-of-truth highlight.

### 13.3 Missing (one source has, others don't)

Not really disagreement. A value missing from source X is just not-yet-observed from X. The projection uses whichever source has the value.

### 13.4 Override

Manual user override always wins. A user-edited field is marked `user_override=true` and no source-based reconciliation touches it without explicit re-override. Record the override as a `causal_node` with `operation='user_override'`.

## 14. Scheduling and workers

All ingestion is background-job driven. We use the existing pattern of `/api/cron/*` routes triggered by the Docker stack's cron-like process (or a future per-tenant queue). Initial jobs:

- `/api/cron/wayback-seed/route.ts` — scheduled hourly; pops pending Wayback fetches from a queue.
- `/api/cron/edgar-backfill/route.ts` — scheduled daily; processes EDGAR backfill jobs.
- `/api/cron/rss-poll/route.ts` — scheduled every 30 min.
- `/api/cron/news-poll/route.ts` — scheduled every 30 min.

Each job respects the rate limiter (§11) and commits after each record (so a crash mid-batch doesn't lose progress).

New table `source_ingestion_jobs` with status lifecycle (`queued` → `running` → `done` / `failed` / `retrying`). A simple `/admin/ingestion` page shows recent jobs.

## 15. Security concerns

- **SSRF risk**: connectors fetch URLs chosen by users. Block private IP ranges at the fetch layer (no 10.x.x.x, 172.16-31.x.x, 192.168.x.x, 127.x.x.x, 169.254.x.x). Reject redirects into those ranges.
- **XXE risk**: any XML/RSS parser uses a safe defaults (no external entity resolution). Prefer a minimal RSS parser we control over a permissive one.
- **HTML injection when rendering**: source content is user-visible. Always sanitize HTML before render (existing DOMPurify-style approach if present; otherwise text-only rendering).
- **PII in RSS**: most RSS content is public, but authors are mentioned by name. PII scrubber runs post-fetch and sets `metadata.pii_detected`.
- **Secrets in user-provided feeds**: if a user pastes a feed URL with embedded credentials, the URL is stored in `source_feeds.feed_url`. Accept this — the user chose it — but do not log credentials in request logs.

## 16. Known gaps / future work

- Paid EDGAR full-text search (we use free API).
- Transcription (OpenAI Whisper or similar) for podcasts without transcripts — cost and legal questions defer to a future sprint.
- LLM-assisted entity extraction — today we do rule-based. Improvements from LLM approaches are real but cost and accuracy need a controlled test.
- Object storage for large source bodies (10-Ks). Inline bytea works up to 5 MB but we should migrate large docs out.
- Cross-source entity dedup (the same press release from Business Wire and PR Newswire): today we dedup on content_hash post-fetch; a future pre-fetch dedup would save bandwidth.

## 17. New code footprint

| File | LOC |
|------|-----|
| `data/db/init/036-sources-schema.sql` | 230 |
| `app/src/lib/sources/types.ts` | 140 |
| `app/src/lib/sources/registry.ts` | 40 |
| `app/src/lib/sources/service.ts` | 280 |
| `app/src/lib/sources/rate-limit.ts` | 120 |
| `app/src/lib/sources/robots.ts` | 90 |
| `app/src/lib/sources/url-normalize.ts` | 70 |
| `app/src/lib/sources/connectors/wayback.ts` | 220 |
| `app/src/lib/sources/connectors/edgar.ts` | 320 |
| `app/src/lib/sources/connectors/rss.ts` | 260 |
| `app/src/lib/sources/connectors/news.ts` | 200 |
| `app/src/lib/sources/connectors/blog.ts` | 160 |
| `app/src/lib/sources/connectors/podcast.ts` | 240 |
| `app/src/lib/sources/scrapers/wsj.ts` etc (×5) | 5 × 60 = 300 |
| `app/src/app/api/sources/**/route.ts` | 400 |
| `app/src/app/api/cron/{wayback,edgar,rss,news}-*/route.ts` | 4 × 80 = 320 |
| `app/src/app/(app)/sources/page.tsx` | 260 |
| `app/src/components/target/sources-panel.tsx` | 220 |
| `app/src/components/sources/source-viewer.tsx` | 240 |
| Tests | ~1200 |

Total: ~5400 LOC.

## 18. Acceptance checklist

- [x] `source_records` table exists with the indexes in §2. *(Migration 036.)*
- [x] Six connectors register in `registry.ts` (wayback, edgar, rss, news/google-news, blog, podcast) + 5 targeted news origins in `NEWS_CONNECTORS` (wsj/bloomberg/reuters/techcrunch/cnbc).
- [x] Wayback: user pastes a LinkedIn URL, gets a snapshot fetched + parsed through LinkedIn parsers (auto-reparse into `page_cache`). *Date-picker UX is Phase 6 polish; core path works.*
- [x] EDGAR: backfill runs on `POST /api/sources/cron/edgar-backfill`; 10-K extracts Risk Factors + Directors/Officers items. *Executive → contact auto-match is Phase 5/6.*
- [x] RSS: adding a feed URL via `source_subscriptions` (migration 042); `/api/sources/cron/rss-poll` fetches. *30-minute cadence is scheduler-side.*
- [x] News scraper respects robots.txt and the per-host rate limiter (1 req/sec per host, token-bucket persistent via `source_rate_limits`).
- [x] Podcast: a feed with `<podcast:transcript>` produces source records including transcript text. *User-upload SRT/VTT/plain path also shipped.*
- [x] Blog: a sitemap.xml path works for one tested corporate blog (6-path probe + `/sitemap.xml` 90d fallback).
- [x] Dedup: re-running an ingestion does not duplicate records (uniqueness constraint on `source_records(tenant_id, source_type, source_id)`).
- [ ] Private IP ranges are blocked at fetch. *Not explicitly verified in the `gatedFetch` implementation — add as a Phase 6 hardening test.*
- [ ] Source-content disagreement test: EDGAR and LinkedIn show different titles → projection shows both with attribution. *Banner UX per ADR-032 is Phase 6; composite resolution (ADR-030) is wired at the weight layer.*
- [ ] User override on a field blocks automatic reconciliation. *Per ADR-032 B decision; UI not yet built.*

## 19. Cross-references

- `03-snippet-editor.md` §3.2 — link snippets reference `source_records`.
- `04-targets-and-graph.md` — target-scoped source rollups.
- `06-evidence-and-provenance.md` — source record fetch events become causal_nodes of kind `fetch_source` (optional; documented there).
- `07-architecture-and-schema.md` §5 — full `source_records` + `source_feeds` + `source_ingestion_jobs` schemas.
- `08-phased-delivery.md` — WS-5 connectors ship individually, not as one block; Wayback + EDGAR first.
