# Open Questions for User Decision

**Scope**: Decisions the user must make before Phase 0 starts. Each includes the context, realistic options with trade-offs, and a recommendation grounded in the existing codebase.
**Purpose**: unblock implementation. We do not need agreement on every question to start Phase 0 — the first three are the hard gate. The rest can be decided in parallel or mid-sprint.

---

## Q1. What exactly is the "self" target — one row, many rows, or a conceptual alias?

### Context

`owner_profiles` is in `016-owner-profile-schema.sql` and is used as the implicit root of almost every existing view. The new `research_targets` table introduces `kind='self'` as a peer with `kind='contact'` and `kind='company'`. Migration (per `07-architecture-and-schema.md` §2.3) inserts one `research_targets` row per owner with `kind='self'`.

Three possible interpretations:

### Options

- **A. One `self` target per owner_profile row.** Owner and self-target are 1:1.
- **B. `self` target is a shim; reads always fall through to `owner_profiles`.** The target row exists only so `research_target_state.primary_target_id` can point at it, but downstream code treats `kind='self'` specially.
- **C. Multiple `self` targets per user.** The user can have different "research personas" of themselves — e.g. "me as a consultant" vs. "me as a board member" — each with its own ICP set.

### Trade-offs

- A is the simplest to migrate; no behavior change for existing users.
- B preserves the `owner_profiles` table as the source of truth but duplicates the concept's reach.
- C is closest to the research use case but introduces a data-model question about how many "mes" an owner can have.

### Recommendation: **A**

Existing dashboards continue to work. The `research_target_icps` table already supports multiple ICP profiles per target — that covers the "different lenses on me" use case C was motivated by, without introducing a many-self concept. Revisit C only if multiple users ask for it.

**Why it blocks**: every downstream system that today reads `owner_profiles` has to choose what to do when target is set. Option A means "nothing changes for self"; option B means a new branch in every read path; option C is a bigger migration.

---

## Q2. What permission model do we ask Chrome to approve for `<all_urls>`?

### Context

WS-3 proposes `optional_host_permissions: ["<all_urls>"]` and per-origin requests via `chrome.permissions.request`. That keeps the install-time permission prompt to LinkedIn only. But Chrome has been tightening MV3 policies; some reviewers want even optional `<all_urls>` avoided.

### Options

- **A. `optional_host_permissions: ["<all_urls>"]` + per-origin request.** User adds permission on demand for each site they snip from.
- **B. Enumerate specific origins.** Ship with a curated list (web.archive.org, *.sec.gov, a handful of major news sites) in `host_permissions`. Nothing outside that list is snip-able.
- **C. Page-action model.** Don't expand permissions; use Chrome's "activeTab" permission which is granted only on user-click. Snipping requires the user to invoke the extension on each page via the toolbar icon.

### Trade-offs

- A is the most general but is still a user-visible scary prompt.
- B is the narrowest footprint but restrictive; every new site is a Chrome Web Store update.
- C avoids the permission expansion but degrades the UX (no hotkey, no content-menu on pages where the extension hasn't been invoked).

### Recommendation: **A for dev and enterprise installs, B for Chrome Web Store public release.**

Ship A behind a compile flag that Chrome Web Store builds don't include. The CWS build starts with B — seeded with the 10 most-common research origins — and users who want more can install the dev build or request an addition. This is more complex but splits the trust problem sensibly.

**Why it blocks**: the manifest.json is decided in Phase 0 before any content script work. Wrong choice means a redo.

---

## Q3. Where does the ExoChain chain_id boundary land for snippets?

### Context

WS-6 (evidence) proposes `snippet:<target_id>` as the chain_id — one chain per target. But another scope was considered:

- Per-user chain (all snippets ever made by user X).
- Per-tenant chain (all snippets in the tenant).
- Per-session chain (the current research session).

### Options

- **A. Per-target.** Every snippet about Acme Inc is on the `snippet:acme-target-id` chain.
- **B. Per-tenant.** All snippets in the whole tenant are one chain.
- **C. Per-session.** Each research session starts a fresh chain; the chain ends when the session closes.

### Trade-offs

- A: high audit value ("has anyone altered an Acme snippet"), reasonable write contention (target-level). But chain boundaries change when target switches — not a problem unless you need cross-target verification.
- B: one chain to verify. But all writes serialize against one chain; heavy activity causes contention. And the audit claim is weaker ("no one altered any snippet" is less actionable than "no one altered an Acme snippet").
- C: session length bounds the chain; natural audit for "during Session X what evidence was gathered?". But a snippet can belong to exactly one session — if a user snips outside a session, we need a fallback chain, and those sessions are the default case today.

### Recommendation: **A**

Per-target chains. The audit question users actually ask is "is this target's research record intact?" not "did anyone touch anything in the tenant?" Contention is fine at per-target scale.

**Why it blocks**: the chain_id formation is baked into every snippet write in WS-3. Choosing late means rewriting the adapter.

---

## Q4. What does "secondary target" activate, automatically?

### Context

WS-4 §4 says secondary is for comparison. Several degrees of automation are possible.

### Options

- **A. Fully passive.** Setting a secondary target does not change any card unless the user picks a "compare" lens. The secondary is a bookmark.
- **B. Auto-compare.** Every scoring card, dashboard metric, and graph cluster automatically renders in two columns when secondary is set.
- **C. Opt-in compare toggle.** Secondary is set; the UI surfaces a "Compare" toggle on cards that support it; only toggled cards render comparison.

### Trade-offs

- A is safest — no auto-behavior changes. But the secondary is under-leveraged.
- B is the most showy but clutters the screen; cards that don't have a natural comparison (e.g., recent tasks) look weird.
- C gives the user control without requiring an explicit lens.

### Recommendation: **C**

Opt-in toggle per card. The comparison lens (from §4.10.1) is the "all on" shortcut. This keeps default views uncluttered and lets users explore comparison card-by-card.

---

## Q5. How aggressive is the default source-trust ordering for conflicts?

### Context

WS-5 §13.2 proposes `edgar > press_release > news > linkedin > blog > podcast > wayback`. That is one reasonable default. A different ordering would give different outcomes.

### Options

- **A. Default the recommended order.** Tenant-overridable.
- **B. Recency over source.** Newest value wins regardless of source type. Ties broken by source priority.
- **C. No implicit winner.** Show all values with attribution. User always picks the canonical one explicitly.

### Trade-offs

- A: reasonable defaults, low configuration cost, risk of being wrong for some tenants.
- B: matches newsroom intuition but fragile — a scraped news article's date can be wrong.
- C: never wrong but every conflict requires user action.

### Recommendation: **A with conflict banner**

Use the recommended ordering, but when a conflict occurs, banner on the target page says "Sources disagree on Jane Doe's title — EDGAR says X, press release says Y. Used EDGAR. [Change]" with a one-click override. That balances automation with override without burying the disagreement.

---

## Q6. Should sidebar parse-result / diff / unmatched panels show for self-only, or for all targets?

### Context

WS-2 scopes the panels to "the currently-locked target." But a user might capture their own profile and not care about the diff. Or they might only want the panels active for research targets.

### Options

- **A. Always on, for any capture.** Consistent behavior regardless of target kind.
- **B. Auto-hide when target = self.** Research-only panels for research-only targets.
- **C. User preference.** Per-panel toggle in sidebar settings.

### Recommendation: **A with individual collapse state persisted**

Always on, but collapsible with remembered state. Users who find self-diffs noisy collapse them; users researching a target open them. This leans on sidebar analytics (§2.11) to decide later if B is worth adding.

---

## Q7. How do we handle user-overridden fields when a new source arrives?

### Context

WS-5 §13.4 says manual overrides always win. But a new source may present evidence that should make the user reconsider.

### Options

- **A. Hard lock.** Once overridden, never touch again. User sees new source in provenance but not in the field value.
- **B. Challenge banner.** Override stands; but a banner alerts "New source disagrees — review." User can clear the override.
- **C. Soft override with expiry.** Override expires after a configurable interval (e.g., 30 days) if a new source contradicts.

### Recommendation: **B**

Banner. Hard locking is silently wrong when data shifts; expiry is surprising. Banner gives the user control with a visible prompt.

---

## Q8. Do we archive old `parse_field_outcomes` rows or aggregate them?

### Context

Per WS-1 telemetry, we get one row per field per capture. With 50 captures/day/user × ~20 fields × 20 users × 90 days = ~1.8M rows. Not huge, but grows.

### Options

- **A. Raw retention 90 days, then drop.** Simple. Aggregate table keeps long-term trends.
- **B. Raw retention indefinitely.** Query raw for any trend. Grows unbounded.
- **C. Compressed archive.** Raw for 30 days; aggregated into `parse_field_outcomes_daily` for 2 years.

### Recommendation: **A**

Daily rollup into a small `parse_field_outcomes_daily` aggregate table for long-term trend; raw kept 90 days for debugging. 90-day rows are small and queryable; anything older is trend-only. Documented as ADR-031.

---

## Q9. When the user creates a snippet that names a person not yet in the database, how much do we pre-fill?

### Context

WS-3 §5 says the "Create new contact" path captures only name + optional LinkedIn URL. That is minimal.

### Options

- **A. Name + URL only.** Rest fills in when the user captures the LinkedIn profile later.
- **B. Ask for headline + company inline.** Slightly more friction; richer first-pass data.
- **C. Auto-enrich on create.** Invoke the existing enrichment waterfall (`app/src/lib/enrichment/waterfall.ts`) immediately.

### Recommendation: **A**

Friction minimization matters in a sidebar widget. The existing enrichment waterfall costs money; we don't want snippet creation to spawn paid API calls silently. Enrichment on-demand from the main app is already a separate action the user takes.

---

## Q10. Do we ship a "researcher mode" or roll new features into the default experience?

### Context

Target switching, two-column dashboards, and source panels are a departure from today's owner-only workflow. Existing users may not want these unless they opt in.

### Options

- **A. Feature flags per-user.** Each user toggles on "Research mode" in their settings. New UI only appears when on.
- **B. Global per-tenant flag.** Tenant admin enables; all users get it.
- **C. Ship as default.** Everyone gets the new UI; existing users can opt out individually.

### Recommendation: **B with `RESEARCH_*` env flags**

Per-tenant flag in env (matching the `ECC_*` pattern from v0.5.0). Tenants who don't opt in see unchanged behavior. Individual users don't get a toggle — keeps surface small. In Phase 6 we evaluate making it default for new tenants.

---

## Summary — which questions block Phase 0

| Q | Blocks Phase 0 | Needs answer by |
|---|----------------|-----------------|
| Q1 self target model | Yes — migration shape | Day 0 |
| Q2 permission model | Yes — manifest.json | Day 0 |
| Q3 chain_id scope | Yes — adapter shape | Day 0 |
| Q4 secondary automation | No — UI-only | End of Phase 1 |
| Q5 source trust | No — default + override can change | End of Phase 2 |
| Q6 panel visibility | No — setting-only | End of Phase 2 |
| Q7 override handling | No — configurable | End of Phase 3 |
| Q8 retention | Yes — migration 033 | Day 0 |
| Q9 snippet contact pre-fill | No — can add later | End of Phase 1 |
| Q10 feature flag granularity | Yes — Phase 0 flag wiring | Day 0 |

**Five questions block Phase 0: Q1, Q2, Q3, Q8, Q10.**

**Recommended defaults if the user says "proceed with your recommendations":**

- Q1: A. One self target per owner_profile.
- Q2: A for dev / B for CWS release.
- Q3: A. Per-target chain_id.
- Q8: A. 90-day raw retention, daily aggregate.
- Q10: B. Per-tenant env flag.

With those five decisions documented, Phase 0 can begin. The other five questions (Q4, Q5, Q6, Q7, Q9) will surface implementation-time decisions but do not block migrations or core architecture.

## Extra — decisions the user might add

If the user has opinions on these, they can amend here before Phase 0:

- Whether to register `RESEARCH_*` feature flags via env or via an admin UI (we assumed env).
- Whether to support a "team-shared lens" concept where multiple users in a tenant share a saved lens (noted as future work).
- Whether snippet blobs should move to object storage from day 1 or deferred (we assumed deferred; inline bytea with 1 MB cap).
- Whether to include a "legal hold" flag on source_records that blocks deletion (regulatory consideration; we assumed no).
