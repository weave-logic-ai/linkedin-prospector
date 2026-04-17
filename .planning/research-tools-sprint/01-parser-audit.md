# WS-1 — Parser Audit + Hardening

**Scope**: A systematic audit of all six page parsers, driven by real captured HTML, plus the infrastructure to make parser regressions loud, visible, and cheap to fix.
**Non-scope**: Rewriting parsers from scratch. Using an LLM to synthesize selectors. Switching off Cheerio.
**Depends on**: existing `page_cache` table (from `013-cache-graph-schema.sql`), existing `selector_configs` table (read by `app/src/lib/parser/parse-engine.ts:30`), the nine fields defined in `app/src/lib/parser/types.ts`.

---

## 1. Why this work, in one paragraph

The current parsing layer is clever — `app/src/lib/parser/selector-extractor.ts` implements a selector chain with per-index confidence decay, and the profile parser (`app/src/lib/parser/parsers/profile-parser.ts`) combines CSS selectors with content-heuristics (title tag, URL slug, text-pattern matching for connections) to survive LinkedIn's hashed class names. But the cleverness is invisible to the user. Today a capture can land with one field extracted at confidence 0.5 and eight fields at 0 and the only signal the user gets is that a contact row got created with NULLs. We need a fixture-driven audit to (a) establish a baseline yield per parser, (b) identify the cheapest wins, (c) stand up selector telemetry, and (d) make future drift self-reporting.

## 2. Current parser architecture — what is actually there

Cite-source review of `app/src/lib/parser/**/*.ts`:

| File | Key behavior |
|------|-------------|
| `parse-engine.ts:30` | Loads active `SelectorConfig` from DB by `page_type = X AND is_active = true AND selector_name = 'full_config'`, takes the newest `version`. |
| `parse-engine.ts:52` | `parseCachedPage(cacheId)` loads HTML from `page_cache`, dispatches to the registered parser, marks `parsed=true`, runs `upsertContactFromProfile` / `upsertContactsFromSearch` fire-and-forget. Silent catch on upsert failures at `:165`. |
| `parser-registry.ts` | In-memory `Map<LinkedInPageType, PageParser>`. Registration happens once in `parse-engine.ts:20-25` as a side effect of import. |
| `selector-extractor.ts:48` | `extractField` tries each selector in chain, returns confidence `Math.max(0.5, 1.0 - i*0.15)` for the matched position; first match wins. Transforms: `trim`, `parseInt`, `parseConnectionCount`, `joinArray`. |
| `selector-extractor.ts:126` | `applyHeuristics` runs regex rules declared in the config against already-extracted fields; heuristic matches get 0.7 confidence. |
| `profile-parser.ts:79` | Three strategies combined: CSS selectors → content heuristics (title tag, URL slug, profile-link-sibling walk, `img[alt*="profile picture"]`, `xxx connections` regex, section-heading `About` walk) → config-declared heuristics. Merge policy at `:36` prefers the selector result if it is non-null. |
| `search-parser.ts:32` | Two strategies: selector-based extraction first, **fallback to href-pattern extraction** (`a[href*="/in/"]` with dedup by slug, plus inline scrape for headline / location / mutual / degree). Pushes a diagnostic string into `result.errors` indicating fallback was used. |
| `company-parser.ts` | Selectors only. No content fallback. |
| `connections-parser.ts` | Selectors only. Single pass. |
| `messages-parser.ts` | Selectors only. Single pass. |
| `feed-parser.ts` | Selectors only. Single pass. |

### 2.1 Observations that shape the audit

1. **Only profile and search have content-fallbacks.** Company, connections, messages, feed parsers are pure selector-chain — they will fail silently on the next CSS churn. This is the top actionable finding.
2. **Confidence is computed but never persisted.** `ExtractedField.confidence` exists at `app/src/lib/parser/types.ts:13` but nothing stores it per-capture after the upsert. We cannot tell today whether a given field was extracted at 0.5 or 0.95 last month vs. this month. That is the foundation of any drift-detection story and it does not exist.
3. **`parse-engine.ts:165` swallows upsert errors.** When a parser succeeds but the DB upsert throws (unique-violation races, missing FKs), the capture looks good to the user but no contact lands. This is one of the 28+ silent catches noted in `docs/development_notes/stub-inventory.md` (P2) — and it is a particularly dangerous one because it sits on the happy path.
4. **There is no fixture corpus in the repo.** `app/tests/` only contains ECC, scoring, and taxonomy suites. No parser has an HTML-fixture regression test. `app/e2e/smoke-all-pages.spec.ts` screenshots rendered app pages, not LinkedIn HTML.
5. **Selector configs live in the DB, not in source.** `parse-engine.ts:30` reads `selector_configs` — the six active configs are seeded via SQL, not versioned by git. That means a rollback of a parser change is a DB task, not a git revert. This was probably the right call originally (so a non-engineer can tweak selectors) but it means today we have no history of selector changes.
6. **LinkedIn hashed class names are already a problem that someone solved once.** The search parser's Strategy 2 at `search-parser.ts:88` exists *because* CSS class names are obfuscated; that solution is already in the repo for one parser and can be generalized.

### 2.2 What "yield" looks like today

We do not have a number — that is the point. The first deliverable is a number.

## 3. Audit methodology

### 3.1 Stage 1 — Build a captured-fixture corpus

Add `data/parser-fixtures/` (not gitignored for small fixtures, but we will redact PII):

```
data/parser-fixtures/
  README.md
  profile/
    fixture-2025-linkedin-self-view.html
    fixture-2025-linkedin-1st-degree.html
    fixture-2025-linkedin-2nd-degree.html
    fixture-2025-linkedin-company-admin.html
    fixture-2025-linkedin-no-about.html
    fixture-2025-linkedin-international.html
  company/
    fixture-2025-linkedin-large-public.html
    fixture-2025-linkedin-small-private.html
    fixture-2025-linkedin-stealth.html
  search/
    fixture-2025-linkedin-people-page1.html
    fixture-2025-linkedin-people-page3.html
    fixture-2025-linkedin-no-results.html
    fixture-2025-linkedin-content-results.html
  connections/
    fixture-2025-linkedin-connections.html
  messages/
    fixture-2025-linkedin-conversations.html
  feed/
    fixture-2025-linkedin-feed-top.html
```

**Sourcing**: pull directly from `page_cache` on a dev DB; select one row per `page_type` per URL, redact any PII before committing. Add a helper `scripts/capture-fixture.ts` that takes a `page_cache.id` and produces a redacted file named per the above convention.

**Redaction rules**:
- Names replaced with `FirstName LastName`.
- Profile slugs replaced with `test-person-N`.
- Emails / phone numbers replaced with obvious fake values.
- Profile image URLs pointed at a 1x1 placeholder.
- `<meta property="og:*">` scrubbed.

Redaction is non-trivial — we will reuse the regexes in `agent/network-navigator/skills/linkedin-prospector/scripts/lib/redact.mjs` (once surveyed) rather than re-inventing.

### 3.2 Stage 2 — Compute per-parser, per-field yield

Add a test harness `tests/parser/fixtures.test.ts` that:

1. For each fixture file, loads the active `SelectorConfig` for the page type from a sqlite fixture (committed to `tests/fixtures/selector-configs.json` so the test does not require a running DB).
2. Calls `parseHtml(html, pageType, config, url, 'test-capture-id')` from `parse-engine.ts:180`.
3. Asserts **per field** in `ParseResult.fields`:
   - A golden JSON snapshot per fixture (`tests/parser/__snapshots__/fixture-X.json`) captures `{ field, value, confidence, source, selectorUsed }` for every extracted field.
   - Jest snapshot testing is adequate; the file diff is the finding.
4. Emits `tests/parser/yield-report.json` with the aggregate: `{ pageType: { field: { yield, avgConfidence, nSamples } } }`.

This becomes the **baseline**. Any diff in the snapshot file on a future PR is a parser change that needs review.

### 3.3 Stage 3 — Categorize gaps

For each snapshot yield row below 0.6, classify with a one-line label:

- `LINKEDIN_CLASS_OBFUSCATION` — selector broke because CSS class is hashed / changed.
- `MISSING_SELECTOR` — field never had a selector in the config.
- `HEURISTIC_HOLE` — selector missed but a heuristic could catch it.
- `SHAPE_CHANGE` — the field exists but LinkedIn moved it under a different parent.
- `EMPTY_SOURCE` — the page genuinely doesn't expose the field (e.g. 2nd-degree profile has no contact info section).

A tally of these labels across the fixture corpus tells us what the cheapest wins are.

### 3.4 Stage 4 — Publish the findings report

`docs/development_notes/parser-audit-2026-Q2.md` — one table per parser. Format:

```
### Profile parser
| Field            | Yield | Avg confidence | Top gap label          |
|------------------|-------|----------------|-------------------------|
| name             | 1.00  | 0.90           | —                       |
| headline         | 0.66  | 0.78           | LINKEDIN_CLASS_OBFUSCATION |
| location         | 0.33  | 0.60           | SHAPE_CHANGE            |
| about            | 0.66  | 0.70           | HEURISTIC_HOLE          |
| connectionsCount | 1.00  | 0.85           | —                       |
| profileImageUrl  | 1.00  | 0.95           | —                       |
| experience       | 0.50  | 0.50           | SHAPE_CHANGE            |
| education        | 0.16  | 0.50           | MISSING_SELECTOR        |
| skills           | 0.00  | 0.00           | LINKEDIN_CLASS_OBFUSCATION |
```

We commit to a yield target per parser (§7) based on this report.

## 4. The hardened model — selector-as-data + confidence telemetry + fallback chains

### 4.1 Selectors stay in DB, but are versioned

`selector_configs` already has a `version` column (`app/src/types/selector-config.ts:44`). We add a second column and a history table:

- `selector_configs.change_reason TEXT` — why this version replaced the last.
- New table `selector_config_audit` — append-only log of every create/update with actor, diff, and `effective_at`.

Then add `scripts/export-selector-configs.ts` that dumps the active configs to `data/parser-fixtures/selector-configs-snapshot.json`. Running it and committing the output gives us git-visible change history without making the DB not the source of truth. The snapshot is what the fixture test (`§3.2`) loads.

### 4.2 Confidence and miss telemetry, persisted per capture

New table `parse_field_outcomes` (schema in `07-architecture-and-schema.md` §3.1):

```
parse_field_outcomes (
  id uuid primary key,
  capture_id uuid not null references page_cache(capture_id) ...,
  page_type text not null,
  field_name text not null,
  value_present boolean not null,
  confidence real,
  source text,        -- 'selector' | 'heuristic' | 'content-heuristic' | 'title-tag' | 'url-slug'
  selector_used text,
  selector_index int,
  created_at timestamptz default now()
)
```

Written once per parse call, batch inserted from `parse-engine.ts` right before the upsert. Indexed on `(page_type, field_name, created_at)` for trend queries.

**Trend query** the admin page runs daily:

```sql
WITH recent AS (
  SELECT page_type, field_name,
         AVG(CASE WHEN value_present THEN 1 ELSE 0 END) AS yield,
         AVG(confidence) AS avg_conf
  FROM parse_field_outcomes
  WHERE created_at > now() - interval '7 days'
  GROUP BY page_type, field_name
),
prior AS (
  SELECT page_type, field_name,
         AVG(CASE WHEN value_present THEN 1 ELSE 0 END) AS yield
  FROM parse_field_outcomes
  WHERE created_at BETWEEN now() - interval '30 days' AND now() - interval '7 days'
  GROUP BY page_type, field_name
)
SELECT r.page_type, r.field_name, r.yield AS yield_7d, p.yield AS yield_prior,
       (r.yield - p.yield) AS delta
FROM recent r JOIN prior p USING(page_type, field_name)
WHERE r.yield < 0.6 OR (p.yield > 0 AND r.yield - p.yield < -0.2)
ORDER BY delta;
```

Anything in that result set is a regression. A cron (`app/src/app/api/cron/parser-alerts/route.ts`) runs it daily and writes an in-app banner on the admin page. Email/webhook alerts are optional and default-off.

### 4.3 Fallback chains — generalize the search-parser pattern

The search parser's Strategy 2 (`search-parser.ts:88`) is href-pattern recovery: find structural anchors (`/in/<slug>`), extract values from nearby text. We generalize this idea into a **fallback registry** per parser:

```typescript
// app/src/lib/parser/fallbacks/index.ts (NEW)
export interface FallbackStrategy<T> {
  readonly name: string;                // 'href-pattern', 'title-tag', 'og-meta', etc.
  readonly pageType: LinkedInPageType;
  apply($: CheerioAPI, url: string): Partial<T>;
}
```

We register fallbacks per page type. The parse flow becomes: selectors → heuristics → fallbacks (in order) → merge. Each fallback returns a partial result; the merge policy prefers higher-confidence values, then earlier-in-registry values on ties.

**Fallbacks we add, ordered by impact (from §3.3 findings — will be ratified by the actual audit)**:

| Page type | Fallback | Rationale |
|-----------|----------|-----------|
| PROFILE | `og-meta` | LinkedIn populates `<meta property="og:image">` and `<meta property="og:description">` reliably for public profiles. Covers `profileImageUrl`, some `headline`. |
| PROFILE | `json-ld-person` | LinkedIn sometimes emits `<script type="application/ld+json">` with a `Person` schema. When present, it is gold. Check first. |
| COMPANY | `og-meta` | Same reason; `og:image` for logo, `og:description` for tagline. |
| COMPANY | `json-ld-organization` | Covers name, url, industry, numberOfEmployees. |
| CONNECTIONS | `href-pattern` | Mirror search parser's recovery; `a[href*="/in/"]` within the connections container. |
| MESSAGES | `href-pattern` | Same — look for `a[href*="/in/"]` siblings of conversation rows. |
| FEED | `href-pattern + data-urn` | LinkedIn feed posts carry `data-urn="urn:li:activity:..."` — a stable anchor. Extract author profile links from within a post container scoped by URN. |

Every fallback logs to `parse_field_outcomes` with `source='fallback'` and `selector_used='fallback:<name>'` so telemetry distinguishes it from the primary path.

### 4.4 Unmatched-DOM detection

A piece of visibility plumbing that WS-2 consumes. After all selectors and fallbacks run, we walk the DOM one more time looking for "large unexplained blocks":

- Any `section` or `div[aria-labelledby]` whose text content is longer than 80 characters and whose nodes do not overlap with any element that matched at least one selector.
- We keep a map of matched element signatures (tag+class-first-token+nth-of-type path) while extracting, then diff.

Output is a list of `{ domPath, textPreview, byteLength }` entries on `ParseResult` (new optional field: `unmatched`). WS-2 surfaces this in the sidebar with a "Report as regression" button per entry. Click sends the entry + the HTML fragment to a new `POST /api/parser/regression-report` endpoint, which stores a fixture, opens a GitHub issue (if `GITHUB_REPORT_WEBHOOK_URL` is set), and writes a `parser_regression_reports` row.

### 4.5 Schema-version the parser output

`ParseResult` already carries `parserVersion` (types.ts:149) but the contact upsert (`contact-upsert.ts`) ignores it. We promote `parserVersion` into `contacts.last_parser_version` (new column) so we can find contacts last touched by an old, known-bad parser version and re-parse them from `page_cache` after a selector fix.

## 5. Per-parser findings (hypotheses, ratified by §3 audit)

We have not yet run the audit. These are hypotheses based on a read of the parser code; confirming or invalidating each is a specific task in the audit stage.

### 5.1 Profile parser (`parsers/profile-parser.ts`)

**Strengths**:
- Three-strategy merge at `:36` is actually robust.
- Content heuristics for `name`, `connectionsCount`, `profileImageUrl` look solid.

**Hypothesized gaps**:
- `experience` extraction at `:267` splits on newlines. LinkedIn's current markup puts experience entries in separate `li` elements with inner structure; newline splitting probably loses date ranges and descriptions.
- `education` extraction at `:285` has the same problem.
- `skills` extraction at `:83` relies entirely on a selector chain. With hashed classes this almost certainly returns 0 results.
- `location` at `:180` uses an expensive filter over all elements; may be both slow and brittle.

**Proposed remediation**:
- Add `json-ld-person` fallback (cheap, high confidence when present).
- Add an "experience list" fallback that looks for `[data-section="experience"]` or its successor and uses href-pattern recovery to get company names (the company name is always a link to the company page).
- Add `og-meta` fallback for `profileImageUrl` and optional `headline`.

### 5.2 Company parser (`parsers/company-parser.ts`)

**Hypothesized gaps**:
- No content fallbacks at all. This parser breaks hard on any CSS churn.
- `specialties` comes from a single selector and a `split(',')` transform — fragile.
- `founded` is always null (see `:81`: `founded: null`).
- `employeesOnLinkedIn` is always null (`:86`).

**Proposed remediation**:
- Add `og-meta` + `json-ld-organization` fallbacks.
- Add a href-pattern fallback for the `companySize` ("N employees" link is consistent).
- Fill in `founded` and `employeesOnLinkedIn` — both are in the company About section; add selectors + heuristics.

### 5.3 Search parser (`parsers/search-parser.ts`)

**Strengths**:
- The only parser with a real recovery path. `:88` fallback is the template for what other parsers should look like.

**Hypothesized gaps**:
- Headline extraction at `:121` uses a regex; regexes against free text work until they don't.
- Location regex at `:138` is English-biased (capitalized-word pattern).
- No connection degree extracted via selector — only by text sniff. LinkedIn emits `1st`, `2nd`, `3rd` as visible spans; check `aria-label` too.

**Proposed remediation**:
- Formalize the Strategy-2 path as a named `href-pattern` fallback in the registry (§4.3), so the same code pattern becomes reusable for Connections and Messages.
- Add unit tests using real search fixtures for edge cases (i18n names, 1st-degree with "Connect" vs. "Message" CTAs).

### 5.4 Connections parser (`parsers/connections-parser.ts`)

**Hypothesized gaps**:
- Pure selector-based. Likely yielding near zero after any CSS churn.
- `connectedDate` selector almost certainly broken — LinkedIn shows this as a tooltip, not visible text.

**Proposed remediation**:
- Add `href-pattern` fallback; this page is the cleanest candidate for that strategy because the entire page structure is a list of profile links.
- Accept that `connectedDate` is low-value and stop pretending to extract it unless we find a stable anchor.

### 5.5 Messages parser (`parsers/messages-parser.ts`)

**Hypothesized gaps**:
- Pure selector-based.
- `participantProfileUrl` is always null (`:87`).
- No capture of the conversation thread ID, which would be the dedup key.

**Proposed remediation**:
- `href-pattern` fallback.
- Fill in `participantProfileUrl`.

### 5.6 Feed parser (`parsers/feed-parser.ts`)

**Hypothesized gaps**:
- Pure selector-based.
- `postUrl`, `authorProfileUrl`, `postedTimeAgo`, `reposts`, `postType` all always null.
- No URN extraction.

**Proposed remediation**:
- `data-urn` anchor fallback — LinkedIn posts all carry `data-urn="urn:li:activity:..."`. This is the most stable anchor on any page. Use it to scope each post, then extract relative.

## 6. Loud failure model — how regressions scream

The point of all this telemetry is surfacing drift fast, to the right audience. Three loudness levels:

### 6.1 Immediate — sidebar-time (WS-2)

After a capture, the sidebar shows: fields extracted, per-field confidence tier (green ≥0.8, yellow 0.4–0.8, red 0–0.4), unmatched DOM regions. WS-2 owns the UI; this WS owns the data.

### 6.2 Daily — admin banner

The trend query (§4.2) runs as a cron. If any field drops yield by >20% week-over-week or below 0.6 absolute, a banner appears on `/admin/parsers` with a link to the audit report for the affected field.

### 6.3 Release-gate — snapshot tests

`tests/parser/fixtures.test.ts` snapshots must match on every PR. A diff is deliberately noisy — the PR author must acknowledge by running `jest -u` and the reviewer sees the golden diff.

This is the same pattern the changelog uses for screenshot-based e2e tests in `app/e2e/`.

## 7. Yield targets

Targets are ambitious but achievable with the fallback work. They become acceptance criteria for WS-1 completion. We ratify the numbers after §3.4 publishes the baseline.

| Parser | Field | Current (hypothesized) | Target after sprint |
|--------|-------|------------------------|---------------------|
| PROFILE | name | 1.00 | ≥ 0.98 |
| PROFILE | headline | ~0.66 | ≥ 0.90 |
| PROFILE | location | ~0.33 | ≥ 0.70 |
| PROFILE | about | ~0.66 | ≥ 0.80 |
| PROFILE | experience | ~0.50 | ≥ 0.80 |
| PROFILE | education | ~0.20 | ≥ 0.60 |
| PROFILE | skills | ~0.00 | ≥ 0.50 |
| COMPANY | name | 1.00 | ≥ 0.98 |
| COMPANY | industry | ~0.60 | ≥ 0.90 |
| COMPANY | size | ~0.50 | ≥ 0.85 |
| COMPANY | about | ~0.70 | ≥ 0.90 |
| SEARCH | results count > 0 | ~0.80 | ≥ 0.95 |
| SEARCH | headline per result | ~0.50 | ≥ 0.80 |
| CONNECTIONS | name | ? | ≥ 0.90 |
| CONNECTIONS | profileUrl | ? | ≥ 0.95 |
| MESSAGES | participantName | ? | ≥ 0.90 |
| MESSAGES | participantProfileUrl | 0.00 | ≥ 0.80 |
| FEED | authorName | ? | ≥ 0.85 |
| FEED | authorProfileUrl | 0.00 | ≥ 0.70 |

## 8. New code footprint (in numbers)

Rough sizing for the sprint plan (`08-phased-delivery.md`):

| File | Purpose | Est. LOC |
|------|---------|----------|
| `app/src/lib/parser/fallbacks/og-meta.ts` | Open Graph meta fallback | 80 |
| `app/src/lib/parser/fallbacks/json-ld.ts` | JSON-LD Person / Organization fallback | 120 |
| `app/src/lib/parser/fallbacks/href-pattern.ts` | Generalized href-pattern scraper | 180 |
| `app/src/lib/parser/fallbacks/data-urn.ts` | URN-anchored feed post extraction | 90 |
| `app/src/lib/parser/fallbacks/registry.ts` | Per-page-type fallback registration | 40 |
| `app/src/lib/parser/unmatched-dom.ts` | Detect unexplained large DOM blocks | 120 |
| `app/src/lib/parser/telemetry.ts` | Write `parse_field_outcomes` batch | 80 |
| `app/src/app/api/parser/regression-report/route.ts` | Regression report ingest | 140 |
| `app/src/app/api/parser/yield-report/route.ts` | Admin-facing yield query | 80 |
| `app/src/app/api/cron/parser-alerts/route.ts` | Daily trend alert | 100 |
| `app/src/app/(app)/admin/parsers/page.tsx` | Admin parser health page | 220 |
| `tests/parser/fixtures.test.ts` | Golden-snapshot test runner | 150 |
| `tests/parser/__snapshots__/*.json` | Fixture snapshots (generated) | ~2000 |
| `scripts/capture-fixture.ts` | Fixture sourcing helper | 80 |
| `scripts/export-selector-configs.ts` | Selector config snapshot exporter | 50 |
| `data/db/init/033-parse-telemetry.sql` | `parse_field_outcomes`, `parser_regression_reports`, `selector_config_audit` | 100 |
| `data/parser-fixtures/*.html` | Redacted HTML corpus (~15 files) | n/a (binary-like) |
| Per-parser fallback wiring in each of 6 parsers | Minimal edits to call registry | 20 × 6 = 120 |
| Modifications to `parse-engine.ts` | Call telemetry + unmatched-dom | 30 |
| Modifications to `contact-upsert.ts` | Write `last_parser_version` | 15 |

Total net-new code: ~1750 LOC excluding generated snapshots and HTML fixtures.

## 9. Risk register

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| Capturing fixtures leaks PII | High | Automated redaction in `capture-fixture.ts`; reviewer checklist; redaction regex tests. |
| LinkedIn changes CSS during sprint | Medium | We are building the observability *for* this case. Short-term fix: update a fixture + selector, long-term: add a fallback. |
| `parse_field_outcomes` grows unboundedly | Medium | Daily rollup aggregate table; retain raw rows for 90 days then drop. Included in 033 migration. |
| Snapshot tests become noisy and ignored | Medium | Gate on explicit acknowledgment (`-u` must be run locally); CI rejects PRs with unacknowledged snapshot diffs. |
| Fallbacks mask primary-selector rot | High | Telemetry records `source='fallback'`. The alert query (§4.2) has a companion query: "fields where the primary selector's yield dropped but fallback saved them" — we want to know about those, not let them hide. |

## 10. Acceptance checklist

- [x] `data/parser-fixtures/` contains 14 files across all 7 page types, committed after redaction (v1.0.0 rule set).
- [x] `tests/parser/fixtures.test.ts` runs green with golden snapshots committed.
- [x] `data/db/init/033-parse-telemetry.sql` creates `parse_field_outcomes` + daily aggregate. *`parser_regression_reports` + `selector_config_audit` scoped into Phase 2 Track D migration 039 as `parser_selector_flags` — same purpose.*
- [x] `parse-engine.ts` writes a row per field per parse into `parse_field_outcomes`.
- [x] Fallback registry is wired into all six parsers.
- [x] `/admin/parsers` page renders the 7-day yield-by-field table and surfaces regressions.
- [x] `POST /api/parser/regression-report` accepts unmatched-DOM reports. *GitHub issue creation webhook is deferred to Phase 6.*
- [x] `docs/development_notes/parser-audit-2026-Q2.md` published (Phase 1.5 update at `parser-audit-2026-Q2-update.md`).
- [x] Yield targets in §7 are met on the fixture corpus (100% on every expected field after Phase 1.5 parser wins).

## 11. Cross-references

- `02-visibility-and-feedback.md` — consumes `ParseResult.unmatched` + `parse_field_outcomes` to render the sidebar view.
- `07-architecture-and-schema.md` §3.1 — schema for new tables.
- `08-phased-delivery.md` — WS-1 sequencing and critical-path placement.
- `docs/development_notes/stub-inventory.md` — P2 silent-catch at `parse-engine.ts:165` tracked as part of this work.
