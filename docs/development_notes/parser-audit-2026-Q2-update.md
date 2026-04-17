# Parser Audit — 2026-Q2 Phase 1.5 Update

**Sprint**: Research Tools Sprint, Phase 1.5
**Corpus**: `data/parser-fixtures/` — 14 redacted synthetic fixtures (unchanged)
**Run date**: 2026-04-17 (update)
**Generator**: `tests/parser/compute-yield.test.ts`
**Companion to**: `parser-audit-2026-Q2.md` (Track A baseline)

> This update records the selector-gap closures shipped in
> `feat/phase1-5-parser-wins`. The fixture corpus itself is unchanged; only
> parser code + meta `expectedFields` annotations moved. See the baseline
> document for the corpus description and scoring methodology.

## Summary table (baseline → update)

| Parser         | Fixtures | Fields | Baseline yield | Updated yield | Delta |
|----------------|---------:|-------:|---------------:|--------------:|-------|
| PROFILE        | 2        | 9      | 100%           | 100%          | —     |
| COMPANY        | 2        | 10     | ~82%           | **100%**      | +18pp |
| SEARCH_PEOPLE  | 2        | 6      | 100%           | 100%          | —     |
| SEARCH_CONTENT | 2        | 9      | **0%**         | **100%**      | +100pp |
| CONNECTIONS    | 2        | 4      | 100%           | 100%          | —     |
| MESSAGES       | 2        | 5      | 100%           | 100%          | —     |
| FEED           | 2        | 9      | ~89%           | **100%**      | +11pp |

Per-field yields are re-computed from `tests/parser/__yield__/yield-baseline.json`
on every `compute-yield.test.ts` run. Every expected field now reports
`yield: 1.0` against the fixture corpus. This is a *structural* ceiling —
live LinkedIn drift can still bring individual fields down, and the fallback
registry remains the long-term recovery surface.

## What landed

### COMPANY: `founded` + `employeesOnLinkedIn`

- **Before**: `app/src/lib/parser/parsers/company-parser.ts` hardcoded both
  to `null` on lines 81 / 86 (per §5.2 of the baseline).
- **After**: both are driven by a selector chain plus a registered fallback
  strategy:
  - Selector chain (`tests/parser/fixtures/selector-configs.json` +
    `data/db/init/017-extension-schema.sql`):
    - `founded` → `dt:contains('Founded') + dd` plus content-heuristic
      variants.
    - `employeesOnLinkedIn` → `a[href*='/people/']` anchor, parsed via the
      existing `parseInt`-in-context pattern inside the parser.
  - Fallback strategy `fallback:details-href` (new, registered in
    `app/src/lib/parser/fallbacks/strategies.ts` under `COMPANY`) scans
    every `<dt>` for an exact `"Founded"` label and every `/people/`
    anchor for a `"NNN associated members"` match. Fires only when the
    primary chain misses (standard `alreadyFilled` logic in
    `registry.ts`).
- **Fixture yield**: `founded` 0→100%, `employeesOnLinkedIn` 0→100%.
- **Meta**: `company/02-with-specialties.meta.json.expectedFields`
  unchanged (both fields were already listed). The `KNOWN_GAPS` allowlist
  in `tests/parser/fixtures.test.ts` is now empty for this fixture.

### SEARCH_CONTENT: thin wrapper parser

- **Before**: no parser registered; `parse-engine.ts` routed to the
  no-parser branch and returned `success=false` for every content-search
  page (§3.1 of the baseline).
- **After**: `app/src/lib/parser/parsers/search-content-parser.ts` ships a
  thin wrapper that:
  - Uses `.reusable-search__result-container` (SEARCH_CONTENT's envelope)
    for the result list, matching the existing offline selector config.
  - Reuses the feed-parser's post-extraction approach — author link,
    `.feed-shared-actor__name`, `.feed-shared-update-v2__description`,
    `.social-details-social-counts` — on a per-envelope basis.
  - Adds a small `postType` classifier (article vs post) keyed on the
    `data-urn` prefix (`urn:li:article:*` vs `urn:li:activity:*`) and the
    presence of `<article class="feed-shared-article">` / `h3.feed-shared-article__title`.
  - Exposes a new `SearchContentParseData` / `SearchContentResultEntry`
    type in `app/src/lib/parser/types.ts` (separate from
    `SearchResultEntry`, which targets people-search).
  - Registers in `parse-engine.ts` alongside the other six parsers.
- **Fixture yield**: 0% → 100% across both content-search fixtures
  (`01-basic.html`, `02-with-articles.html`).
- **Contact upsert**: the engine's `SEARCH_PEOPLE`/`SEARCH_CONTENT` branch
  was split so SEARCH_CONTENT maps each result's `authorName` +
  `authorProfileUrl` onto a minimal `SearchResultEntry` before calling
  `upsertContactsFromSearch`. Post-level metadata (title, content,
  engagement) stays out of the contact record for now.
- **Meta**: no expectedFields changes — the fixture meta already declared
  the target shape; Track A left it aspirational.

### FEED: `postedTimeAgo`, `reposts`, `postType`

- **Before**: `feed-parser.ts` hardcoded `reposts: null`, `postedTimeAgo:
  null`, `postType: 'unknown'` (§5.6).
- **After**:
  - `postedTimeAgo` reads the first relative-time-looking string in
    `.feed-shared-actor__sub-description` (or `.update-components-actor__sub-description`,
    or a bare `<time>`) — regex-guarded so we don't accept unrelated
    text.
  - `reposts` reads `.social-details-social-counts__reposts` with a
    second fallback class, parsed `parseInt`-style.
  - `postType` is classified in order `repost > poll > article > event >
    original` via presence-only checks on the stable CSS markers
    (`.update-v2-social-activity__reshared-by`, `.feed-shared-poll`,
    `.feed-shared-article`, `.feed-shared-event`). `unknown` remains the
    defensive tail.
- **Fixture yield**: all three fields 0→100% on `feed/02`. `feed/01`
  doesn't ship a `sub-description`, so `postedTimeAgo` stays null there
  (that fixture's `expectedFields` doesn't demand it).

### Consolidation: `getDefaultTenantId`

- **Before**: two parallel copies of the helper — `app/src/lib/snippets/tenant.ts`
  and `app/src/lib/targets/service.ts` — both reading the same
  `tenants.slug='default'` row.
- **After**: canonical implementation lives in
  `app/src/lib/db/tenants.ts` (new file, sits next to `client.ts`).
  - `@/lib/snippets/tenant` re-exports it (keeps the existing
    `import { getDefaultTenantId } from '@/lib/snippets/tenant'` sites
    working — no call-site churn).
  - `@/lib/targets/service` re-exports it too, so both
    `import { getDefaultTenantId, … } from '@/lib/targets/service'` and
    `import { getDefaultTenantId } from '@/lib/snippets/tenant'` remain
    valid.

## Test delta

- **Fixture tests** (`tests/parser/fixtures.test.ts`): the `KNOWN_GAPS`
  allowlist lost four entries (company/02, feed/02, search-content/01,
  search-content/02). The two search-content fixtures now register
  per-field expectedFields assertions that *pass* rather than being
  suppressed.
- **Golden-snapshot coverage**: the fixtures test file total grew by the
  number of expected fields per search-content fixture (9 + 8 = 17
  previously-suppressed assertions, now active).
- **Yield generator** (`tests/parser/compute-yield.test.ts`): regenerated
  `yield-baseline.json` — every expected-field row is now at
  `yield: 1.0`.
- **Full suite**: 432/432 tests pass (no new tests needed; existing
  golden coverage closed the gaps).

## What still ships next (Phase 2 candidates)

Carry-over from the baseline audit §"What ships next" that is *not*
closed by this PR:

1. `profile-parser.ts` `json-ld-person` + `og-meta` content-heuristic
   fallbacks for live profile captures (baseline §5.1).
2. `messages-parser.ts` group-thread participant extraction — still
   intentionally null per ADR scope.
3. `SEARCH_CONTENT` video classification — the `postType: 'video'` case
   needs a dedicated DOM signal; fixture 02 keeps video posts in a
   plain activity shell, so we currently route them to `'post'` rather
   than guessing.
4. Live-capture telemetry to replace the fixture-based yield table on
   `/admin/parsers` (Phase 2, per ADR-031).
