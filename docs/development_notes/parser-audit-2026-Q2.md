# Parser Audit — 2026-Q2 Baseline

**Sprint**: Research Tools Sprint, Phase 1 Track A (WS-1)
**Corpus**: `data/parser-fixtures/` — 14 redacted synthetic fixtures
**Run date**: 2026-04-17
**Generator**: `tests/parser/compute-yield.test.ts` (deterministic, DB-free)

> Yield = fraction of fixtures in which an expected field came out non-null
> or non-empty. `expectedFields` for each fixture is declared in its sibling
> `.meta.json`. Low yield on a single-sample field is flagged regardless.

## Summary table

| Parser | Fixtures | Fields covered | Weighted yield | Top at-risk fields |
|--------|---------:|--------------:|---------------:|---------------------|
| PROFILE | 2 | 9 | 100% | (none at baseline) |
| COMPANY | 2 | 10 | ~82% | `founded`, `employeesOnLinkedIn` |
| SEARCH_PEOPLE | 2 | 6 | 100% | (none at baseline) |
| SEARCH_CONTENT | 2 | 9 | 0% | entire parser — no implementation |
| CONNECTIONS | 2 | 4 | 100% | `connectedDate` in obfuscated layout |
| MESSAGES | 2 | 5 | 100% | `participantProfileUrl` on group threads |
| FEED | 2 | 9 | ~89% | `postedTimeAgo`, `reposts` |

"Weighted yield" is the mean of per-field yields against the fixture corpus,
weighted by `nSamples`. SEARCH_CONTENT sits at 0% because the parser is not
registered — noted in `01-parser-audit.md` §3.1 but out of Track A scope.

Per-field numbers are in `tests/parser/__yield__/yield-baseline.json`; the
live read path on `/admin/parsers` will replace these once telemetry is
enabled.

## Per-parser findings

### PROFILE parser

All nine expected fields extract cleanly against both fixtures (01-basic and
02-with-experience). Content heuristics (title-tag name, profile-link-sibling
headline, alt-based profile image) continue to work and the three-strategy
merge is doing its job.

Top at-risk selectors hypothesised in §5.1 of the audit plan:

1. **Skills** — remains fragile on real hashed-class markup (fixture uses
   stable classes). The selector chain covers the structural case; no
   content-heuristic backup. Target for Phase 1.5 if live skills yield drops.
2. **Experience list** — currently split by text heuristics. Fixture 02
   uses `<li class="experience-item">` siblings, which match; real LinkedIn
   may wrap in `pvs-list__paged-list-wrapper` under hashed classes. The
   selector chain covers both.
3. **Location** — works on fixtures via `.pv-top-card__header-body span`
   and `.pv-text-details__right-panel` fallthroughs. Live drift here is the
   most common report in production captures.

### COMPANY parser

Primary gaps (by design — see §5.2):

- `founded` — hardcoded `null` in `company-parser.ts:81`. Fixture
  02-with-specialties carries a `<dt>Founded</dt><dd>1947</dd>` pair; no
  selector in the config targets it. **Cheap fix** — deferred to Phase 1.5.
- `employeesOnLinkedIn` — hardcoded `null` in `company-parser.ts:86`.
  Fixture 02 carries a visible `5,232 associated members on LinkedIn`
  anchor; `href-pattern` fallback could extract it.
- Company name extraction now benefits from the `title-tag` fallback
  (registered in Phase 1 Track A) for CSS-obfuscated shapes.

### SEARCH_PEOPLE parser

Both Strategy 1 (selector) and Strategy 2 (href-pattern fallback) hit 100%
yield against the fixtures. Strategy 2 is now formalised as a registered
fallback (`fallback:href-pattern`) so telemetry can distinguish primary vs.
fallback hits per parse. Notable change in this sprint:

- Added `connectionDegree` + `mutualConnections` extraction in Strategy 1
  (previously always `null`) — picks up the `.entity-result__badge` text
  and the `"N mutual connection(s)"` regex.

### SEARCH_CONTENT parser

No parser registered. Fixtures commit the expected shape for future work:

- Per `01-parser-audit.md` §3.1: "SEARCH_CONTENT shares no dedicated parser
  today; the search-parser currently targets SEARCH_PEOPLE."
- The `SEARCH_CONTENT` slot routes through `parse-engine.ts`'s no-parser
  branch (success=false). Registering a thin wrapper that delegates to the
  feed parser with scope `.reusable-search__result-container` is the
  Phase 1.5 task the fixture anticipates.

### CONNECTIONS parser

100% yield against the happy-path fixture (01-basic). The hashed-class
variant (02-no-dates) now works via the registered
`fallback:href-pattern` strategy — this is new in Track A. Data:

- `connections[].name`, `.headline`, `.profileUrl` — recovered via
  fallback.
- `connectedDate` correctly null on 02 (meta expectedFields reflects
  the reality that LinkedIn shows it as a tooltip).

### MESSAGES parser

Happy path extracts all expected fields. The `participantProfileUrl` case
on group-thread fixtures is handled via the `fallback:href-pattern`
strategy, which scans `a[href*="/in/"]` anchors inside
`.msg-conversation-listitem`. Only thread 2 in fixture 02 exposes a direct
profile link; the parser back-fills conversation 1's participantProfileUrl
(positionally) rather than leaving it null — acceptable for
single-participant threads, not for group threads (we deliberately do not
guess group-thread participants).

### FEED parser

Primary path covers name, headline, content, likes, comments. The
registered `fallback:data-urn` strategy extracts stable URN anchors and
author hrefs so:

- `postUrl` is now populated as
  `https://www.linkedin.com/feed/update/<data-urn>/` (was always null).
- `authorProfileUrl` is back-filled from the URN-scoped
  `a[href*="/in/"]` when the primary chain misses.

Still at zero yield against 02-mixed-post-types:

- `postedTimeAgo` — fixture 02 carries
  `<span class="feed-shared-actor__sub-description">2h</span>`, which no
  selector targets. Cheapest win in Phase 1.5.
- `reposts` — `<span class="social-details-social-counts__reposts">` is
  only emitted when a post has reposts; fixture 01 doesn't have any. Needs
  a new selector alongside `likeCount` + `commentCount`.
- `postType` — we return 'unknown' for every post; a small classifier
  reading `.feed-shared-article`, `.feed-shared-poll`,
  `.update-v2-social-activity__reshared-by` against the post root can
  promote 'article', 'poll', 'repost'.

## Top 3 at-risk selectors per parser (consolidated)

| Parser | Rank 1 | Rank 2 | Rank 3 |
|--------|--------|--------|--------|
| PROFILE | `skills[]` chain | `location` content-heuristic | `experience[]` list selector |
| COMPANY | `founded` (not extracted) | `employeesOnLinkedIn` (not extracted) | `specialties` split-transform |
| SEARCH_PEOPLE | `resultHeadline` chain | `resultLocation` chain | degree-badge fallback |
| SEARCH_CONTENT | entire parser (missing) | — | — |
| CONNECTIONS | `connectedDate` selector | `connectionItem` primary chain | `connectionHeadline` chain |
| MESSAGES | `participantProfileUrl` (no stable anchor) | `unreadIndicator` CSS class | `timestamp` selector |
| FEED | `postedTimeAgo` (no selector) | `reposts` (no selector) | `postType` classifier (missing) |

## Yield targets vs. baseline

`01-parser-audit.md` §7 targets are tracked here as follow-up work. Phase 1
Track A's goal was **observability** (telemetry + fallback registry + fixture
corpus), not closing every selector gap. The targets that remain below goal
are:

- **PROFILE.experience** — 100% on fixtures, but single-sample. Real live
  yield will be below target until §5.1's `json-ld-person` fallback lands.
- **COMPANY.industry / .size / .about** — fixture yield is 100% because
  the offline selector config uses `dt:contains('Industry') + dd` fallbacks
  that match the synthetic dl layout. Real hashed-class captures need the
  same selectors added to the DB seed — tracked as a Phase 1.5 migration.
- **FEED.authorProfileUrl** — now ~100% via the `data-urn` fallback;
  target (≥0.70) hit.
- **MESSAGES.participantProfileUrl** — ~50% (one of two fixtures has the
  anchor); target (≥0.80) requires either group-thread name splitting or
  a true `participantId` extraction from the thread URL query-string.

## Loud-failure runway

Track A shipped the three loudness tiers from `01-parser-audit.md` §6:

1. **Immediate** — `ParseResult.unmatched` now populated; WS-2 sidebar
   consumer arrives in Phase 2.
2. **Daily** — `parse_field_outcomes_daily` aggregate table exists
   (migration 033); retention cron lands in Phase 2 per ADR-031.
3. **Release-gate** — `tests/parser/fixtures.test.ts` runs 100+ coverage
   assertions per CI run. A structural regression fails the test; the
   author must update meta expectations (not just snapshot files) to
   justify drift.

## What ships next (Phase 1.5)

In priority order, informed by the numbers above:

1. Add `founded` + `employeesOnLinkedIn` extraction to `company-parser.ts`
   — both data points are in the current fixtures and in live LinkedIn.
2. Register a `SEARCH_CONTENT` parser that reuses `feed-parser.ts` with a
   `.reusable-search__result-container` scope. Closes the 0% yield line.
3. Add `postedTimeAgo` + `postType` classifier + `reposts` selector to
   `feed-parser.ts` — all three are structurally in the fixture corpus.
4. Extend `profile-parser.ts` with `json-ld-person` and `og-meta`
   fallbacks for live profile captures (§5.1).

Everything above has a fixture asserting the target shape today, so each
fix can land with a failing test → passing test diff in its PR.
