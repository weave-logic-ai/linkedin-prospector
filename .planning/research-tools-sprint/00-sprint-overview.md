# Research Tools Sprint — Overview

**Date**: 2026-04-17
**Status**: Draft — pending user review of open questions in `09-open-questions.md`
**Entry criterion**: `v0.5.0` (sidebar target panel, auto-paginate, ECC hardening) is live and stable.
**Supersedes**: `docs/plans/browser-snippet-expansion.md` (kept as input reference; not deleted)

---

## 1. Sprint theme, in the user's words

> "We really want to think through this research tool sprint finding as many ways to shore up the parsing, make it easier to see whats happening, change focus, etc."

Network Navigator started as a LinkedIn prospecting tool. It has quietly turned into a **research platform** whose sharpest insights appear when data from several sources lands in the same causal graph. The user described targeting a client company, capturing LinkedIn pages for its employees, and cross-referencing with Wayback snapshots, press releases, and corporate filings — which surfaced a departed AI director whose old LinkedIn role, missing from the current company page, was still visible in a Wayback snapshot and in a two-year-old press release. The insight was only possible because the graph held evidence from three unrelated sources and could join them on one entity.

This sprint is about making that workflow the **primary** path, not an accident.

## 2. Vision

Network Navigator becomes a **multi-source, target-first research platform** where:

1. Any entity — a contact, a company, yourself — can be the **primary target** of a research session.
2. An optional **secondary target** unlocks differential analysis (MTP between two peers, style deltas between two companies, a candidate vs. their predecessor).
3. Evidence from **LinkedIn, Wayback Machine, SEC EDGAR, press releases, news, blogs, podcasts** all funnels into the same `causal_nodes` substrate with typed provenance.
4. Parsing is **observable at capture time**: users see what came out, what didn't, and can flag gaps without waiting for a backend audit.
5. Arbitrary evidence can be **snipped** from any page, tagged, linked to the target and to people mentioned inside the snippet, and becomes first-class graph data.
6. The UI **re-centers on any entity with a single click**, carrying the research context (session, scoring scope, ECC) with it.

## 3. Goals and non-goals

### 3.1 Goals

- **G-1** Raise parser yield and make regressions visible, without rewriting parsers from scratch. Drive from real captured fixtures.
- **G-2** Show users, at capture time, what was parsed, what changed since last capture, and what the parser could not match.
- **G-3** Snip arbitrary multi-modal evidence from any URL (LinkedIn or otherwise), attach it to a target, link entities mentioned inside, and route it into the ECC causal graph as provenance.
- **G-4** Make target a first-class concept: primary + optional secondary; every downstream feature (scoring, ICP, ECC, gap analysis, graph rendering) scopes against the chosen target(s).
- **G-5** Expand sources beyond LinkedIn: Wayback, SEC EDGAR, RSS-driven press releases, news, blogs, podcast transcripts. Each source type knows how to dedupe and how it maps into the schema.
- **G-6** Make "focus shift" a first-class UI operation: click a graph node, re-center, keep breadcrumbs, support saved research lenses.

### 3.2 Non-goals

- No LLM-authored parser-selector generation (that is a future experiment; we are sticking with hand-curated selectors plus heuristics this sprint).
- No real-time multi-user collaboration on a research session.
- No mobile UI.
- No automated scraping of LinkedIn beyond the user's own browser session — capture stays user-driven.
- No breaking changes to existing public APIs. All new schema is additive; existing scoring/enrichment endpoints stay stable.
- No switch away from PostgreSQL. New tables live alongside the existing 32 init scripts.
- No new paid external services (we do not take on a paid EDGAR API this sprint; start with the free XBRL submissions API).

## 4. Guiding principles

1. **Evidence first.** Every fact the app shows should be traceable to a capture or snippet. If it cannot be traced, it is a score-side inference and must be marked as such.
2. **Failures should scream.** Parser drops should appear in the sidebar within seconds of capture, not in a weekly audit.
3. **Target before tool.** The user picks *who* they are researching first; the app then orients scoring, capture routing, and graph around that choice.
4. **Additive, reversible, flag-gated.** Every new surface ships behind a flag like the ECC work did (`ECC_*`). Nothing silently changes existing behavior.
5. **Fixtures are the source of truth for parser correctness.** Tests that assert against real captured HTML catch drift; tests that mock cheerio do not.
6. **Cite your sources.** Every architectural claim in this plan cites a code file or doc. If it does not, it is speculation and should be flagged.
7. **Do not reinvent ECC.** Snippets and multi-source evidence plug into the existing `causal_nodes` / `exo_chain_entries` / `cross_refs` tables (migrations `025`–`029`). Those tables were built for exactly this.

## 5. User stories — five concrete scenarios

These come directly from the user's described experience. Each is solvable after this sprint ships.

### 5.1 US-1 — "Target a client company and surface the missing director"

**As** a consultant researching a prospect company
**I want** to set a company as my primary target, capture LinkedIn pages for its employees, pull in its press releases and a Wayback snapshot of its team page, and see a unified timeline of who was there when
**So that** I can spot departures, title changes, and promotions that LinkedIn alone hides.

**Success**: a timeline view on the company target shows a previously-listed AI director who appears in a 2024 press release and a July 2024 Wayback snapshot but is absent from the live LinkedIn company page. The app marks the contact as `status=departed` with provenance links to both sources.

Touches: WS-1 (parser yield on company pages), WS-3 (snip press release quote), WS-4 (company as primary target), WS-5 (Wayback + RSS ingestion), WS-6 (timeline lens).

### 5.2 US-2 — "Compare two CEOs on the same dimension"

**As** a researcher preparing for a meeting
**I want** to set one CEO as primary target and a second CEO as secondary target
**So that** I see side-by-side deltas on signaling style, headline framing, posting cadence, and ECC-derived persona without opening two windows.

**Success**: the dashboard's standard cards render in two columns keyed by target; dimensions where the two differ by ≥20% are highlighted.

Touches: WS-4 (secondary target), WS-6 (split-pane lens), WS-2 (feedback shows both were parsed successfully).

### 5.3 US-3 — "Spot a parser regression the day LinkedIn changes CSS"

**As** the app owner
**I want** the sidebar to tell me, right after I capture my own profile, that the `headline` field confidence dropped from 0.9 last time to 0.3 this time, and which section of the DOM was captured but not parsed
**So that** I can file a selector fix before it poisons a week of captures.

**Success**: the capture-diff view shows `headline: confidence ↓ 0.9 → 0.3`, an "Unmatched DOM regions" list names the `.ph5.pb5` card, and one click opens a GitHub issue pre-populated with the offending HTML fragment.

Touches: WS-1 (selector telemetry + confidence trend), WS-2 (diff view, unmatched DOM reveal), WS-6 (parser-health lens).

### 5.4 US-4 — "Snip a SEC 10-K paragraph as evidence on a CEO"

**As** a researcher reading a 10-K filing for a targeted company
**I want** to text-select a sentence about the CEO, press a hotkey, confirm which person it is about, add the tag `filing/risk-factors/leadership`, and have that snippet become a first-class piece of evidence on the CEO's contact record
**So that** later scoring can cite "Listed as KP in 10-K 2025 item 1A" as a signal.

**Success**: the snippet becomes a `causal_node` of kind `evidence`, with an `exo_chain_entries` row hashing the original URL + paragraph + timestamp. The contact's provenance panel now shows the snippet; the scoring adapter can consume `kind='evidence'` nodes when computing legitimacy signals.

Touches: WS-3 (multi-modal snip, tag taxonomy, entity link inside snippet), WS-5 (EDGAR as a source type), WS-6 (provenance panel on contact).

### 5.5 US-5 — "Pivot from the company graph to one employee in one click"

**As** a researcher staring at a company-centric graph
**I want** to click any employee node in the graph and have the whole app re-orient around that employee — sidebar, dashboard, gap analysis, ECC provenance, scoring context
**So that** I can drill in without losing the company context I had up.

**Success**: one click re-centers; a breadcrumb at the top of the app shows "Acme Inc → Jane Doe", with the back arrow restoring the company-centered state in under 200 ms.

Touches: WS-4 (re-center semantics + history stack), WS-6 (breadcrumbs + back stack), WS-1 (parser yield on the contact makes the re-centered view worth looking at).

## 6. Workstreams at a glance

Each is detailed in its own doc.

| WS | Name | Doc | Critical dependency |
|----|------|-----|---------------------|
| WS-1 | Parser audit + hardening | `01-parser-audit.md` | Fixture corpus |
| WS-2 | Visibility + parsing feedback | `02-visibility-and-feedback.md` | WS-1 telemetry |
| WS-3 | Snippet editor | `03-snippet-editor.md` | WS-7 schema (evidence kind) |
| WS-4 | Targets + graph re-centering | `04-targets-and-graph.md` | Schema refactor |
| WS-5 | Source expansion | `05-source-expansion.md` | WS-3 (evidence model) |
| WS-6 | Focus-shift UX | Threaded through `02`, `04` | WS-4 |
| — | Evidence + ECC provenance | `06-evidence-and-provenance.md` | Cross-cutting |
| — | Schema + API shape | `07-architecture-and-schema.md` | All |
| — | Phased delivery | `08-phased-delivery.md` | All |
| — | Open questions | `09-open-questions.md` | User decision |

## 7. Success criteria for the sprint

1. A user can set any contact, company, or themself as the primary target and any other entity as the secondary target from one UI surface. Both targets survive a tab close and reload.
2. After every capture, the sidebar shows extracted fields, a diff vs. the last capture of the same entity, and a list of DOM regions that were in the HTML but not matched by any selector or heuristic.
3. A one-click "Report regression" button on a dropped field opens a pre-filled issue and stores a fixture for the test suite automatically.
4. A user can snip text, an image crop, or a link from any URL they have granted access to, tag it, and link a person mentioned inside it to a contact in the database. The snippet appears as a `kind='evidence'` node in `causal_nodes`, with an `exo_chain_entries` row providing tamper-evident provenance.
5. The app ingests at least one Wayback snapshot URL and one SEC EDGAR 10-K filing end-to-end. Both produce structured data on the target entity and cite their source.
6. Clicking any node in the graph re-centers the whole app on that node with under 200 ms perceived latency on a laptop; the breadcrumb trail shows the prior target and the back-arrow restores it.
7. Parser-yield telemetry (per parser, per field, rolling 7-day miss rate) is queryable from an admin page and an alert fires when miss rate exceeds 20% for any field over a 24-hour window.
8. All new schema ships behind a `RESEARCH_TOOLS_*` flag set (mirroring the `ECC_*` pattern from `docker-compose.yml` and `docs/development_notes/ecc/runtime-verification.md`). Flags default `false`. Turning them off restores current behavior.

## 8. Constraints carried over from v0.5.0

- PostgreSQL is still the only persistence layer. `pgvector` is available (already used by 010-vector-schema.sql and the ECC sprint). No Redis, no separate graph DB.
- All new tables must carry `tenant_id` + RLS (pattern from `020-tenant-schema.sql` and `030-ecc-rls.sql`).
- Chrome extension stays MV3. Any permission expansion is opt-in and per-origin (see WS-3 permission model).
- `DEFAULT_TENANT_ID='default'` hardcode in `app/src/lib/ecc/causal-graph/scoring-adapter.ts:7` is a known P0 in `docs/development_notes/stub-inventory.md`. The new adapters in this sprint **must** take `tenantId` as a parameter and resolve from the request context, so we do not add new instances of the bug.
- Existing public API contracts stay stable. All new endpoints live under new paths.

## 9. Risks and mitigations (top-level; per-WS detail in the individual docs)

| Risk | Mitigation |
|------|-----------|
| Schema refactor around `target` concept breaks existing owner-profile code | Keep the `owner_profiles` table; add a shim row in `research_targets` with `kind='self'` that aliases to it. Migrate readers incrementally. |
| `<all_urls>` permission expansion scares users / reviewers | Opt-in per origin via on-demand permission request (`chrome.permissions.request`) from the side panel. Documented in WS-3. |
| New source ingestion explodes dedup complexity | Single `source_records` table with `(source_type, source_id)` unique constraint; every connector routes through it. Documented in WS-5 + WS-7. |
| Graph becomes unreadable with 5 entity types × N sources × provenance edges | Lens system: each lens defines which node kinds and edge relations to show. Default lens hides provenance edges. Documented in WS-6. |
| Parser telemetry turns into alert fatigue | Rolling-window thresholds (7-day baseline, alert on 24-hour deviation); alerts start as in-app banners, email only after a configured count. Documented in WS-1. |
| Snippet volume balloons `causal_nodes` | `causal_nodes.kind='evidence'` rows partitioned logically by `entity_type='snippet'`; a retention/archive policy is a post-sprint follow-up, not a blocker. Documented in WS-7. |

## 10. Glossary

- **Target** — the entity (contact, company, or self) that the UI is currently oriented around. Supersedes the existing implicit "owner" concept for most downstream features.
- **Primary target** — the target being researched.
- **Secondary target** — optional second target used for differential views.
- **Lens** — a saved UI configuration (which panels, which node kinds to show, which metrics to compute) bound to a primary/secondary target pair.
- **Snippet** — user-captured fragment of arbitrary web content attached as evidence to a target.
- **Evidence node** — `causal_nodes` row with `entity_type='snippet'`, linked to one or more `contacts` / `companies` via edges.
- **Source record** — canonical row for a fetched-once external artifact (Wayback snapshot, EDGAR filing, RSS item). De-duplication key.
- **Parser yield** — proportion of attempted fields that extracted a non-null value at confidence ≥ 0.6, averaged over a rolling window.
- **Miss rate** — 1 − yield, typically per field.

## 11. Reading order

Start with `09-open-questions.md` — five-to-ten blocking decisions are surfaced there. Then `07-architecture-and-schema.md` for the concrete shape of what we are building, then the per-WS docs in whatever order matches your curiosity. `08-phased-delivery.md` is the execution order.
