# ADR-032: Conflict resolution UI — banner, not silent override

**Status**: Accepted (date: 2026-04-17)

## Context

Two orthogonal situations produce conflicting field values on a target:

1. **Source-vs-source disagreement** — two ingested sources report different
   values (e.g. EDGAR vs press release on a title).
   (`05-source-expansion.md` §13.2, lines 373-378)
2. **User-override vs source** — the user manually set a field value, then a
   newly-ingested source contradicts that manual choice.
   (`05-source-expansion.md` §13.4, lines 384-388)

`09-open-questions.md` Q7 (lines 158-173) focused on the second case and
considered three shapes:

- **A**: Hard lock — once overridden, never touched. User sees new source in
  provenance only, never in the rendered value.
- **B**: Challenge banner — override stands at display time; a banner alerts
  "New source disagrees — review" with a one-click clear-override.
- **C**: Soft override with expiry — override auto-clears after N days if a
  new source contradicts.

Operator answer is explicit:

> "B. We want to highlight conflicts, not lock and hide them."
> (`10-decisions.md` Q7, lines 133-135)

## Decision

All conflicts are surfaced via a banner on the target page; none are silently
resolved. Behavior:

1. **User overrides win at display time**. When a user has explicitly set a
   field, the rendered value is the override regardless of what sources say.
   (`10-decisions.md` Q7, lines 138-140)
2. **A contradicting source triggers a challenge banner** on the target page:
   "New source disagrees — review" with a one-click "Clear override" action
   that reverts to the source-derived value.
   (`10-decisions.md` Q7, lines 139-140)
3. **No hard lock**: rejected as the anti-pattern the operator specifically
   called out. Hidden-but-stored data is silently-wrong data when the world
   changes.
4. **No expiry**: rejected because explicit review is preferred over
   time-based behavior. An override that expires in the background is
   surprising and breaks the user's mental model of "I set it, it stays
   until I change it."
5. **Source-vs-source conflicts** (ADR-030's composite weighting picks a
   winner) also surface the disagreement. The projected field shows both
   values with attribution: `title: "VP, Technology" (edgar) / "VP
   Engineering" (press_release)` and the source-of-truth highlight.
   (`05-source-expansion.md` §13.2, lines 377-378;
   `10-decisions.md` Q5, lines 114-116)

Banner wiring:

- Trigger: the `source.mismatch` impulse fires when a newly-computed
  projection disagrees with a user override OR when two sources disagree
  with non-trivial weight ratio.
  (`06-evidence-and-provenance.md` §10, lines 230-232)
- Render: a target-page component consumes the impulse and shows the banner
  inline with the affected field. Dismissing the banner without clearing
  the override is allowed — the banner re-appears when another conflicting
  source arrives.

## Consequences

### Positive

- **No silently-wrong data**. The operator called this the "anti-pattern";
  surfacing the conflict keeps the user in the loop.
- **Single UX for both conflict families**. User-override-vs-source and
  source-vs-source both raise banners; dev cost is one component, not two
  flows. (`06-evidence-and-provenance.md` §10, `source.mismatch`)
- **Override ergonomics preserved**. The one-click "Clear override" path is
  the shortest possible revert — no deep settings page, no form.
- **Composable with ADR-030's composite weighting**. Whichever source the
  composite formula picks as the winner, the banner still surfaces the
  disagreement. Users see both the computed winner and the dissenting
  source.

### Negative

- **Banner fatigue risk**. A noisy target (many sources, many fields, many
  conflicts) could spawn many banners. Mitigation: per-user, per-target
  banner-dismiss state; banners only re-appear on a new source arrival, not
  on every page load.
- **Banner priority**. If multiple fields conflict at once, some ordering
  rule is needed — highest-trust-delta first, oldest-unreviewed second.
  Not specified in planning docs; left to implementation with a reviewable
  default.
- **Mobile/small-viewport UX**. Banners compete with scoring cards for
  screen real estate. Out of scope this sprint (non-scope in
  `04-targets-and-graph.md` §Non-scope, line 4) but flagged for a future
  pass.
- **Provenance-chain integrity**. When a user clears an override, the
  clear action is itself a `causal_node` (`operation='user_override'`
  followed by `operation='user_override_cleared'`) — audit trail stays
  intact. Verified in ADR-029's chain model only for snippets; projection
  overrides live on their own edge types.
  (`05-source-expansion.md` §13.4, lines 386-388)

### Neutral

- The banner-dismiss state is per-user, per-target, per-field. Storage in
  `chrome.storage.local` on the extension side and in a per-user
  `banner_state` row server-side for the main app. Schema detail is not in
  this ADR.
- ADR-033's research-mode flag gates the banner UI on the main app; the
  sidebar extension banner is always on.

## Alternatives considered

### Q7 Option A — hard lock

Once overridden, never silently overwritten and new sources are hidden from
the field view (visible only under "show all sources"). Rejected explicitly
by the operator:

> "B. We want to highlight conflicts, not lock and hide them."
> (`10-decisions.md` Q7, lines 133-135)

Silently-wrong data is the failure mode we optimize against.

### Q7 Option C — soft override with expiry

Override auto-clears after N days (e.g. 30) if a new source contradicts.
Rejected: expiry is surprising. The user's mental model is "I set it, it
stays." A time-based clear without an explicit user action undermines that.
(`10-decisions.md` Q7, line 142)

### Two separate components (one for user-vs-source, one for source-vs-source)

Splits the banner UX by conflict family. Rejected: doubles the implementation
and training surface for the same user concern ("two things disagree — fix
it"). One banner with two phrasings keeps the dev surface minimal and the
user-facing concept unified.

## Related

- Source: `.planning/research-tools-sprint/05-source-expansion.md`
  §13.2 (source-vs-source attribution, lines 373-378)
  §13.4 (user override semantics, lines 384-388)
- Source: `.planning/research-tools-sprint/10-decisions.md`
  Q7 (lines 132-142)
- Source: `.planning/research-tools-sprint/09-open-questions.md`
  Q7 (lines 158-173)
- Impulse wiring: `.planning/research-tools-sprint/06-evidence-and-provenance.md`
  §10 (`source.mismatch` impulse type, lines 228-232)
- Cross-ref: ADR-030 (composite weight picks the source-vs-source winner;
  this ADR surfaces the disagreement regardless)
- Cross-ref: ADR-033 (research-mode flag gates banner rendering on the main
  app; sidebar banner is always on)
