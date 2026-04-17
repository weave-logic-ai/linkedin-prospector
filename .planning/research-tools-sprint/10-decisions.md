# Decisions Recorded

**Date**: 2026-04-17
**Scope**: answers to all ten open questions in `09-open-questions.md`. These unblock Phase 0 and should be treated as binding for sprint kickoff.

---

## Q1 — Self target model: **A**

One `self` target per `owner_profile`. Self always exists as the tool operator — the person actually using NetworkNav.

Additional directive from the user:

> "Self is me or the person who is using the tool to discover their network. However, it became clear over the last week that oftentimes you don't want the center of the graph to be yourself. You want to be the target, the person that you're looking at."

This shapes Q4 — the conceptual "target" moves to the secondary when one is picked, but the *data-model* self stays put. Option C (multiple selves as research personas) is **explicitly declined** — the existing persona / niche / ICP layer already covers that need:

> "You don't need to actually make them a persona, so to speak, because they're already part of your persona."

### Implications
- `research_targets` migration inserts exactly one `kind='self'` row per `owner_profile`.
- No "multiple self" semantics anywhere.
- Existing dashboards read `owner_profiles` unchanged for self-target views.

---

## Q2 — Chrome permission model: **B + sidebar "Add host" button**

A hybrid the document did not offer directly. Ship **option B** (curated origin list) as the baseline, plus a **sidebar affordance that adds the current hostname to the approved list at runtime** via `chrome.permissions.request`.

User wording:

> "Add a button that will allow you to add current hostname to approved list in the sidebar. It'd be a good idea to use B as well, to give them a creative list to start with."

### Implications for WS-3 / manifest
- `host_permissions` in `manifest.json` ships with the curated seed list (web.archive.org, *.sec.gov, and the 10 most-common research origins from §5.4 of `03-snippet-editor.md`).
- `optional_host_permissions` includes `<all_urls>` so the sidebar can request per-origin at runtime without a manifest update.
- Sidebar Target Panel gains an "Add this site to approved sources" button that appears when:
  - the active tab's origin is NOT in the already-granted origin set, AND
  - the user has loaded the sidebar on that origin (so the prompt has context).
- Clicking the button calls `chrome.permissions.request({ origins: [origin] })`. Grants persist until the user revokes them from the Chrome permissions page.
- Newly-granted origins are recorded in a local `approvedOrigins` storage key for sidebar UX (checkbox state), but the source of truth remains Chrome's permissions API.

### Why this works
- CWS reviewers see a narrow, reviewable `host_permissions` list.
- Power users (like the user describing this workflow) get the flexibility of A without waiting on CWS updates.
- No compile-flag split between dev and CWS builds — one artifact, one review surface.

---

## Q3 — chain_id scope: **A (per target)**

Per-target chains where a target is a contact OR a company.

User wording:

> "On chains, I would assume it's per user. On question three, you've got that boundary sitting at the edge of the user, so when you do a snippet and you're grabbing it, it would be across or attached to that user's chain. It's also possible that it would be attached to a company's chain, so I think we've got both users and companies. Per target, I think."

### Implications
- Snippet writes form `chain_id = 'snippet:' + target.kind + ':' + target.id`.
  - Example: `snippet:contact:a8f2-…` or `snippet:company:de91-…`.
- Each target has its own Merkle-linked chain. Verification is per-target.
- Self-target chains (`snippet:self:<owner_id>`) are supported — covers snippets the user makes about themselves (rare but valid).
- `chain_id` is generated at snippet insert time, not precomputed in the target row.

---

## Q4 — Secondary target automation: **custom — secondary auto-centers, primary becomes comparison**

This is not A, B, or C as written. The user specified a fourth pattern.

User wording:

> "On the secondary target, I was sort of thinking maybe we just leave self or whatever is the primary target, right? Just leave that alone. That's always going to be the person using the tool, right? If they pick a secondary target, it really then focuses on the secondary target primarily and builds the graph and other elements around that person or that company. Secondary can actually take over the graph and the overall thing, and then the primary or self person basically becomes the comparison so you can actually see."

### Model
- **Primary target**: always self. Immutable for v1. No swap UI.
- **Secondary target**: optional. When set, the UI centers on them:
  - Graph re-roots to the secondary target
  - Dashboard cards reorient to show the secondary as the subject
  - ICP / niche filters default to the secondary's own segment
- **Primary** then surfaces as the **comparison lens** (the "how does this target compare to me" overlay).

### Future (explicitly out of scope for v1)
> "Now it is possible in the future that we'd want to change it out, like maybe I would be doing this work for somebody else and I'd want them to be the self. It is a little complex."

Swap-primary is a future sprint. Flag in `07-architecture-and-schema.md` as ADR-adjacent.

### Implications for WS-4
- `research_target_state` carries `primary_target_id` (always the self-target id for v1) and `secondary_target_id` (nullable).
- UI re-centering triggers when `secondary_target_id` changes, not when `primary_target_id` changes.
- Comparison-toggle cards (per the old Q4 option C) still apply — but the default behavior when secondary is set is already "centered on secondary, primary available as comparison," not "passive bookmark."
- Graph API endpoints accept `?rootTargetId=<secondary>` — the primary is inferred from the current user.
- The "[Compare]" card toggle flips the primary/secondary roles *visually* for that one card, useful for seeing self's numbers against the secondary backdrop.

---

## Q5 — Source trust ordering: **A with dynamic weight overrides**

Default ordering per `05-source-expansion.md` §13.2 stands, **but** per-item weights can promote or demote individual sources dynamically. Viral content (high engagement) or contested sources (disputed factual basis) can move up or down.

User wording:

> "Maybe the default is the default scoring for these categories. To be honest, it may be that the post, the podcast, or whatever it is did so well, like, say, it became viral, that it would actually want to be first, right, because it was the most important, or last, depending on which way you're cutting it. I would say we're probably going to follow the default order for that initial thing, but I do think that the weights can actually affect that."

### Implications
- Source-trust resolution becomes a composite: `final_weight = source_category_default × per_item_multiplier`.
- `per_item_multiplier` is derived from signals like:
  - engagement score (likes, shares, comments)
  - citation count (how many other sources reference this one)
  - recency modifier (optional, tenant-configurable)
  - manual override (user clicks "trust this more")
- Conflict resolution uses `final_weight` at query time, not at ingestion time.
- The "tenant-overridable defaults" in the original recommendation are still there but are now one axis of the composite, not the whole answer.
- Q7's banner treatment (below) still applies — conflicts are surfaced, not buried, regardless of which weight won.

---

## Q6 — Panel visibility: **A (always on, collapsible)**

Consistent with the original recommendation. No nuance needed.

User wording: "A is good."

### Implications
- Parse / diff / unmatched panels render for any capture regardless of target kind.
- Collapse state persisted per-panel per-user in `chrome.storage.local`.
- Collect sidebar analytics per `02-visibility-and-feedback.md` §2.11 to evaluate if a target-kind-scoped default ever becomes necessary.

---

## Q7 — Override handling: **B (challenge banner)**

User explicit:

> "B We want to highlight conflicts, not lock and hide them."

### Implications
- User overrides always win at display time.
- When a new source contradicts, a banner appears on the target page: "New source disagrees — review." with a one-click clear-override action.
- No silent hard-locking (A) — that's the anti-pattern the user specifically called out.
- No expiry (C) — explicit review is preferred over time-based behavior.

---

## Q8 — parse_field_outcomes retention: **A (90-day raw + daily aggregate)**

User: "A".

### Implications
- Migration 033 creates `parse_field_outcomes_daily` aggregate table.
- Raw `parse_field_outcomes` rows are dropped after 90 days via a scheduled job.
- Aggregate rows retained 2 years for trend analysis.
- Documented as ADR-031 per the original recommendation.

---

## Q9 — Snippet contact pre-fill: **A + C (minimal initial + LinkedIn-only enrichment on create)**

User: "A + C (A is good but Use linkedin enrichment initially)"

A hybrid. The user accepts the friction-minimization of A (name + optional URL) but adds C's auto-enrichment scoped to **LinkedIn-only** enrichment rather than the full waterfall.

### Implications
- Sidebar "Create contact from snippet" captures name + optional LinkedIn URL (A).
- On save, the app immediately invokes LinkedIn-only enrichment:
  - No PDL, no Apollo, no Lusha, no TheirStack (those cost money).
  - Only the free LinkedIn URL scrape if the URL is present.
- If no URL was supplied, no enrichment runs; the contact waits for a future LinkedIn capture or manual upsert.
- The existing enrichment waterfall stays the source of truth for non-snippet contact creation flows; snippets get a scoped subset.
- User can manually trigger the full waterfall from the main app after the snippet-created contact exists.

### Why this differs from the original recommendation
The original recommended pure A to avoid paid API calls. The user agrees on the API-cost point but wants LinkedIn enrichment because it's free and produces immediately-actionable data. Pragmatic.

---

## Q10 — Researcher mode rollout: **A + suggestion engine nudge**

User: "A + Suggest engine may push user to toggle on depending on focus"

Per-user feature flag (A), not per-tenant (B). Plus the existing suggestion engine will detect usage patterns indicating research focus and prompt the user to enable it.

User wording:
> "A + Suggest engine may push user to toggle on depending on focus"

### Implications
- New user-settings row for `researchModeEnabled: boolean`, default `false`.
- Research-mode UI (target switching, comparison lens, source panels) gates on this flag.
- The suggestion engine in `app/src/components/suggestion-engine-provider.tsx` gains a rule:
  - If the user has captured more than N non-self LinkedIn profiles (or created snippets) in a recent window, surface a toast: "Looks like you're doing research — want to enable Research Mode?" with a single-click toggle.
- No `RESEARCH_*` env flag — per-user setting is source of truth.
- Tenant admins do not force-enable or disable; it is strictly a user choice.

### Implications vs. original recommendation
The original recommended per-tenant env flag matching the `ECC_*` pattern. The user wants finer-grained control so different users in one tenant can opt in independently. The suggestion engine provides the discoverability that a per-tenant flag would have given through default-on.

---

## Updates to `08-phased-delivery.md`

These decisions affect Phase 0 scope:

1. Q1/A — migration 033 inserts one `self` target per `owner_profile` row. No multi-self plumbing.
2. Q2/hybrid — manifest.json ships with curated `host_permissions` seed + `optional_host_permissions: ["<all_urls>"]`. Sidebar "Add host" button lands in Phase 1 (not Phase 0) — Phase 0 only needs the manifest shape.
3. Q3/A — snippet adapter's chain_id formula uses `snippet:${kind}:${id}` with kind in `{self, contact, company}`.
4. Q8/A — migration 033 includes `parse_field_outcomes_daily`. Retention cron is Phase 2 (not Phase 0).
5. Q10/A — per-user `researchModeEnabled` flag column added to the owner-profile user settings in Phase 0. Suggestion-engine nudge lands in Phase 5.

No phase 0 scope change triggered by Q4, Q5, Q6, Q7, or Q9.

## Pointers for follow-up docs

The following docs should be updated to reflect these decisions before Phase 0 kickoff. This is a sprint-runner task, not a decision task.

- `04-targets-and-graph.md` — integrate the custom Q4 model (secondary auto-centers). Current doc assumes a more passive secondary; rewrite §4 accordingly.
- `03-snippet-editor.md` — update §5 "Create contact" to describe the LinkedIn-only enrichment path. Update manifest + permissions section for the hybrid Q2 answer.
- `05-source-expansion.md` §13 — rework trust-ordering subsection to describe the composite `final_weight` formula.
- `07-architecture-and-schema.md` — adjust research_target_state description: primary always = self for v1.
- `08-phased-delivery.md` — reflect the adjustments listed above.

These edits are small and mechanical. They can go in the same PR that follows this decision record, or in a companion PR.
