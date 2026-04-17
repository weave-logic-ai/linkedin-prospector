# WS-4 — Target Architecture + Graph Re-Centering

**Scope**: Promote "target" from an implicit UI concept to a first-class data model. Support primary and secondary targets. Re-center the whole application (scoring, ECC scope, graph rendering, gap analysis, ICP matching) around the chosen target(s). Add breadcrumbs and a back stack so the user never feels lost after a focus shift.
**Non-scope**: Multi-user collaboration on a target. A mobile UI. Changing the current `owner_profiles` → contact scoring relationship.
**Depends on**: The existing sidebar Target Panel (`v0.5.0`), the existing graph page (visual surface), scoring pipeline (`app/src/lib/scoring/pipeline.ts`), ECC scoring-adapter (`app/src/lib/ecc/causal-graph/scoring-adapter.ts`).

---

## 1. Where we are today — implicit targeting

The app today has several overlapping notions of "who is this view about":

| Surface | What it orients around | How it's chosen |
|---------|------------------------|-----------------|
| `/profile` | The owner (from `owner_profiles`) | Hardcoded — there is one. |
| `/discover` | A niche / ICP filter | URL query params. |
| `/contacts/[id]` | A specific contact | Route param. |
| `/companies/[id]` | A specific company | Route param. |
| `/graph` | The network centered on owner | Implicit. |
| Extension sidebar Target Panel | A "target" with lock sources (task / page / pinned / none) | Documented in `docs/content/docs/browser-extension/target-panel.mdx`. |

The sidebar panel's lock semantics are the closest thing we have to a first-class target, but it exists only in the extension's in-memory state. The server knows nothing about it. Scoring, ECC provenance, gap analysis, ICP matching all assume owner-scoped questions ("how warm is this contact for *me*"), not target-scoped questions ("how warm is this contact for *the CEO I am researching*").

The user's example — targeting a client company to find a departed AI director — requires target-scoped everything.

## 2. The new model

One concept: **research target**. Two instances at a time: primary and optional secondary.

```
research_target {
  id           uuid primary key
  tenant_id    uuid not null references tenants(id)
  kind         'self' | 'contact' | 'company'
  owner_id     uuid     -- if kind='self', references owner_profiles(id)
  contact_id   uuid     -- if kind='contact'
  company_id   uuid     -- if kind='company'
  label        text     -- cached display label (denormalized for listing)
  pinned       boolean default false
  created_at   timestamptz default now()
  updated_at   timestamptz default now()
  last_used_at timestamptz default now()
}
```

Exactly one of `owner_id`, `contact_id`, `company_id` is non-null, enforced by a check constraint.

At any moment a user has a **target state**:

```
research_target_state {
  tenant_id          uuid references tenants(id)
  user_id            uuid      -- the logged-in user (nullable while auth is tenant-scoped only)
  primary_target_id  uuid references research_targets(id)
  secondary_target_id uuid references research_targets(id)
  updated_at         timestamptz default now()
  primary key (tenant_id, user_id)
}
```

This state follows the user across sessions and devices. Changing target is a write to this table.

## 3. What "scopes to target" means, per surface

For each existing surface, define what happens when the target is not the owner.

### 3.1 Scoring

`scoreContact(contactId)` today uses the owner's ICP-profile (`app/src/lib/scoring/pipeline.ts`). A target-scoped score asks a different question: "how warm is this contact as a hiring/partnership/buyer target **for our primary target**."

We do not rewrite the scoring pipeline. Instead we parameterize ICP resolution:

```typescript
interface ScoreContactOptions {
  contactId: string;
  icpProfileName?: string;                      // existing
  targetId?: string;                            // NEW
}
```

When `targetId` is passed and resolves to a contact/company target, the ICP profile used is whichever is associated with that target (if any). Targets can have their own ICP overrides stored in a new `research_target_icps` table — a light join of `research_targets` and `icp_profiles`. For a self target, behavior is unchanged.

The `ECC_CAUSAL_GRAPH` path then records causal nodes with the target as scope. The `DEFAULT_TENANT_ID = 'default'` P0 noted in `stub-inventory.md` is fixed as part of this work by plumbing `tenantId` from the authenticated session through the scoring adapter; the same pattern applies to target.

### 3.2 Graph

Today `/graph` centers on the owner. With targets it centers on `primary_target`. A secondary target renders a second cluster with a "compared to" edge between root nodes.

**Rendering changes**:
- Add a "target pinning" indicator on the graph canvas (name of primary target in the top-left corner).
- Clicking any graph node **re-centers** — sets the clicked node as the new primary target.
- Shift-click sets it as secondary target.
- Alt-click opens a "compare" mini-dialog to choose secondary from a search.

The graph-query endpoint is today owner-scoped; add a `?primaryTargetId=X&secondaryTargetId=Y` parameter. Queries fall back to owner if both unspecified.

### 3.3 Gap analysis

The existing gap analysis page (referenced in commit `bc6d6d1` of CHANGELOG "gap analysis") runs against the owner. Add a target filter. "What's missing for `primary_target_id`" is the same computation over target-scoped inputs.

### 3.4 ECC provenance

`causal_nodes.entity_type` already supports multiple entity kinds. We add `'target'` as a valid value for root nodes representing a whole research question. Individual scorings still use `'score'` / `'dimension'` etc.

A research session (from `028-ecc-cognitive-tick.sql`) can carry a target reference, so all causal nodes written during a session are scoped to that target for later replay.

### 3.5 Gap analysis + ECC scoring + ICP

All three become parameterized by target. The existing `profile` / `contacts/[id]` pages render their familiar cards when target is a self/contact — no change in layout. When target is a company, the same cards render with the company's canonical fields.

### 3.6 Extension sidebar

The sidebar's existing target panel stays. It is now a **viewer** of the server-held target state, not a local one. Lock sources still work the same (task > page > pinned > none), but "pinned" is now a server-persisted pin that survives sessions.

When the sidebar's view differs from the server-held primary target (e.g. user opened a LinkedIn page that page-locks to someone else), it becomes a **candidate**. A new button "Make this the target" promotes the candidate to the server primary target. Without the button click, sidebar views are local.

## 4. Primary vs. secondary — what secondary is for

Not every research session needs a secondary target. It is the switch from "single-entity research" to "comparison research."

**Use cases**:
1. Two peer contacts — comparing signaling style, posting cadence, mutual-connection deltas.
2. Two peer companies — comparing size, industry positioning, hiring signals.
3. A candidate and their predecessor in a role — "did Y change after X left."
4. Self vs. an ICP archetype — "where do I fit vs. the ideal buyer persona."

**Secondary-specific UI**:
- Dashboard cards render in two columns when secondary is set.
- Metric deltas above a threshold (≥ 20% relative) are highlighted.
- Graph shows both subgraphs, with a visual separator.
- ECC provenance is recorded under both targets for any comparison-producing operation.

A simple rule: secondary is never *assumed*. If unset, the app behaves exactly as with the single primary target. No delta cards, no comparison UI. This keeps the default view uncluttered.

## 5. Target switching — UX and semantics

The user's story is "click any graph node to re-center." That is one of several paths.

### 5.1 Paths to switch primary target

1. **Graph node click** — left-click any node → becomes primary.
2. **Graph node shift-click** — becomes secondary.
3. **Breadcrumb click** — click a trail segment → jump back to that target.
4. **Target picker** — global search in the top bar, keyboard shortcut `T`.
5. **Sidebar "Make this the target"** — on a LinkedIn page that page-locked to an entity not currently the primary target.
6. **Contact/company page visit** — optional setting "Auto-target on page visit" (default off) sets the page's entity as target.
7. **URL-encoded** — `?target=<id>` query param sets target on navigation (useful for deep links and email).

### 5.2 Back stack — how to never lose context

Every target switch pushes the previous target onto a per-user stack, bounded at 20 entries:

```
target_history {
  tenant_id       uuid
  user_id         uuid
  target_id       uuid
  role            'primary' | 'secondary'
  switched_at     timestamptz default now()
  switched_from   uuid     -- previous target_id
  switch_source   'graph_click' | 'breadcrumb' | 'picker' | 'sidebar' | 'url' | 'auto_page'
}
```

Indexed on `(user_id, switched_at DESC)`. Queries pull the last N for the breadcrumb trail.

Breadcrumb rendering (top of every page after this sprint):

```
 ● Acme Inc  >  ○ Jane Doe  >  ◉ Bob Smith           [Compare ▾]  [Lens ▾]  [Pin]
```

Each crumb is clickable. The right-most is current. Hover reveals the switch source and time ("via graph click, 4 minutes ago").

### 5.3 Switch latency

The user asked for focus-shift in under 200 ms. We hit that with:
- Target state update = one SQL UPDATE to `research_target_state` (fast).
- Client-side optimistic rendering (switch UI immediately; reconcile when server confirms).
- Graph-query endpoints pre-cache frequent target scopes in `ruvector` or `caches` (existing table in `013-cache-graph-schema.sql`).

## 6. Concurrency and consistency

Multi-tab, multi-device case: user has two tabs open on different targets. What is the "current" target?

Decision: **tab-local primary with server-persisted last-used**. Each tab has a local `primaryTargetId` in `sessionStorage`; the server holds the "last used" per-user for cross-device resume. On server writes, the server sees the tab's intended target; it updates `last_used_at` without overwriting the other tab's state.

This is a deliberately soft consistency model — conflicts are rare (single-user tenants dominate) and the user-visible behavior is "each tab remembers its own target, new tabs open on the last-used."

Multi-user tenancy is not in scope this sprint, but nothing in this model precludes it: `research_target_state` is keyed on `(tenant_id, user_id)`.

## 7. Schema

See `07-architecture-and-schema.md` §4 for the full migration. Summary:

- `research_targets` — the entity itself.
- `research_target_state` — (tenant_id, user_id) → (primary, secondary).
- `research_target_icps` — many-to-many between targets and ICP profiles.
- `target_history` — per-switch append-only log.
- View: `v_research_target` — joins `research_targets` to `contacts` / `companies` / `owner_profiles` for convenient reads.

## 8. The `self` target — migration without surprise

The existing owner concept (`owner_profiles` table, single row typically) is preserved:

1. At migration time, insert one `research_targets` row per `owner_profiles` row with `kind='self'` and `owner_id` set.
2. Update `research_target_state` to set each user's primary to their self-target.
3. All existing code that reads from `owner_profiles` continues to work. New code that needs a target reference uses `research_targets`.

Result: zero-day-one behavior change. A user logs in and sees the same dashboard as before, because their primary target is themselves. They can now change it.

## 9. Api shape

| Endpoint | Purpose |
|----------|---------|
| `GET /api/targets/:id` | Resolve a target row. |
| `POST /api/targets` | Create a target from a contact/company/self. |
| `GET /api/targets` | List known targets, ordered by `last_used_at DESC`. |
| `GET /api/targets/state` | Current primary + secondary for session user. |
| `PUT /api/targets/state` | Set primary + optional secondary. |
| `GET /api/targets/:id/history?limit=20` | Recent switches involving this target. |
| `GET /api/targets/state/history?limit=20` | Full breadcrumb trail. |
| `GET /api/targets/:id/icp-profiles` | ICP profiles associated with this target. |
| `POST /api/targets/:id/icp-profiles` | Attach an ICP profile to a target. |

All endpoints tenant-scoped via the existing auth middleware.

## 10. Graph re-centering implementation

Graph rendering is the surface where target switching is most visible. High-level approach:

1. Graph-data query accepts `primaryTargetId` (and optional `secondaryTargetId`). Layout algorithm computes positions relative to the primary root.
2. Node click → client optimistically re-layouts (keeps graph on-screen), pushes a target-switch request, waits for server confirmation, then reconciles.
3. Re-layout is a recomputation of the same algorithm, not a full re-fetch, when the new primary is already in the current node set. If not, fetch expansion.

Layout choice: we use the existing graph rendering library (not worth switching this sprint). Re-root behavior:
- Force-directed layout centers the new root at (0, 0), preserves positions of other visible nodes where possible.
- Nodes that vanish from scope (out of N-hop reach) fade out.
- New nodes that enter scope fade in.

Target this at 200 ms perceived. Measured via a `performance.mark` span from click to layout-stable.

### 10.1 Lens system

A **lens** is a saved target + view configuration:

```
research_lens {
  id                uuid primary key
  tenant_id         uuid
  user_id           uuid
  name              text
  primary_target_id uuid
  secondary_target_id uuid
  config            jsonb    -- which panels, which node kinds, which metrics
  is_default        boolean default false
  created_at        timestamptz default now()
  updated_at        timestamptz default now()
}
```

User-named ("Acme Inc deep dive") and loadable from a dropdown. The `[Lens ▾]` button in the breadcrumb opens a dropdown of saved lenses + "Save current view as lens" at the bottom.

Defaults: we ship three seed lenses:
- `network-overview` — self as primary, graph-wide view.
- `company-research` — company as primary, with all employees visible in graph.
- `candidate-vs-predecessor` — contact as primary, predecessor as secondary.

## 11. Performance concerns — 5 entity types × N sources × provenance edges

With the source expansion of WS-5 and the evidence model of WS-3, the graph can get dense. Mitigations:

1. **Default hide provenance edges**. Lens setting: `showProvenance: false` by default. Provenance edges are only visible on the "Evidence" lens.
2. **Node kind filters**. Top-of-graph toolbar lets the user toggle visibility per kind (contacts / companies / snippets / source records / ICP profiles).
3. **Edge sampling above threshold**. If the rendered graph would exceed 500 edges, sample the least-weighted half out by default, with a "Show all N edges" disclosure.
4. **Progressive expansion**. Start with primary target + 1 hop. Double-click a node to expand its neighborhood one hop at a time.

These are rendering settings, not data-model constraints. The graph-query endpoint always returns the full scoped subgraph; the UI decides what to draw.

## 12. Compatibility with existing pages

| Page | Before | After |
|------|--------|-------|
| `/profile` | Owner-only view | Renders for any `self` target; unchanged when target is self. |
| `/discover` | Owner-scoped | Adds a "For target: X" header; search is target-scoped if primary is contact or company. |
| `/contacts/[id]` | Row view | Adds "Make this the target" button + Snippets panel (WS-3). |
| `/companies/[id]` | Row view | Same. |
| `/graph` | Owner-centered | Target-centered; re-center on click. |
| `/admin/parsers` | (new, WS-1) | Global, not target-scoped. |

No page is removed; no existing route changes meaning for existing users unless they opt into a non-self target.

## 13. Edge cases

- **Target deleted**: targets have `ON DELETE SET NULL` on `research_target_state.primary_target_id`. If primary is nulled, the UI falls back to self target.
- **Target's underlying contact/company deleted**: same cascade via ON DELETE SET NULL on `research_targets.contact_id` / `company_id`; the target row survives with a "missing" state and a "reconnect or delete" UI.
- **Circular breadcrumbs**: the breadcrumb is ordered by `switched_at`; if the same target appears twice, we show it once and the history query deduplicates. The back stack retains full history.
- **Deep-link with stale `?target=X`**: unrecognized targets redirect to self with a toast "Target X not found."
- **Tenant isolation**: all queries enforce tenant via RLS (pattern from `030-ecc-rls.sql`). New tables ship RLS policies in the same migration.

## 14. Interaction with WS-1 and WS-2

- WS-2's Parse Result / Diff / Unmatched panels scope to the current primary target. When the sidebar target changes, the panels reset to the new target's latest capture.
- WS-1's `parse_field_outcomes` is not target-scoped (parser yield is a global metric about the parser, not about a target). The admin parsers page is global.

## 15. New code footprint

| File | LOC |
|------|-----|
| `data/db/init/035-targets-schema.sql` | 220 |
| `app/src/lib/targets/types.ts` | 80 |
| `app/src/lib/targets/service.ts` | 260 |
| `app/src/lib/targets/history.ts` | 140 |
| `app/src/lib/targets/lens.ts` | 180 |
| `app/src/app/api/targets/**` | 400 |
| `app/src/components/breadcrumbs/target-breadcrumbs.tsx` | 160 |
| `app/src/components/target/target-picker.tsx` | 180 |
| `app/src/components/graph/re-center-handler.tsx` | 140 |
| `app/src/app/(app)/graph/page.tsx` updates | 80 |
| Extension sidebar "Make this the target" button | 50 |
| `app/src/lib/scoring/pipeline.ts` parameterize with targetId | 40 |
| `app/src/lib/ecc/causal-graph/scoring-adapter.ts` tenantId plumbing | 30 |
| Tests | ~800 |

Total: ~2800 LOC.

## 16. Acceptance checklist

- [ ] At migration time, every existing owner has a corresponding `research_targets` row with `kind='self'`, and their `research_target_state.primary_target_id` points to it.
- [ ] Breadcrumb renders on every page and lists the last N switches.
- [ ] Clicking a graph node re-centers in under 200 ms (measured with `performance.mark`).
- [ ] Shift-click sets a secondary target; dashboards render in two columns.
- [ ] Target picker (`T` shortcut) opens global entity search.
- [ ] Deep-linking via `?target=X` works.
- [ ] Scoring pipeline accepts `targetId` and produces target-scoped causal nodes.
- [ ] Lens save + load works for three seed lenses and user-created ones.
- [ ] Targets survive tab close; reopening restores the last-used target.
- [ ] RLS policies prevent one tenant from seeing another's target state.
- [ ] `scoring-adapter.ts` no longer references the `DEFAULT_TENANT_ID` constant.

## 17. Cross-references

- `02-visibility-and-feedback.md` — sidebar panels scope to the current target.
- `03-snippet-editor.md` — snippets attach to the current target.
- `06-evidence-and-provenance.md` — target is a valid causal-node `entity_type`.
- `07-architecture-and-schema.md` §4 — migration details.
- `08-phased-delivery.md` — target schema ships early as dependency for WS-3.
- `docs/content/docs/browser-extension/target-panel.mdx` — semantics preserved, mechanism evolved.
- `docs/development_notes/stub-inventory.md` — P0 `DEFAULT_TENANT_ID` cleared as part of this work.
