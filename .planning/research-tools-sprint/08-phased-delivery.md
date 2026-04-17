# Phased Delivery

**Scope**: Sequencing, dependencies, critical path, and rough sizing for the six workstreams.
**Method**: Dependencies first. Ship the schema and flag infrastructure before any feature that consumes them. Prefer independent vertical slices over broad horizontal rollouts.
**Reference template**: `.planning/ecc-sprint/phase-orchestration.md` (the 5-worktree parallel model). This sprint's dependency shape is different — more serial by nature — so we adopt the ECC template's structure but not its parallelism.

---

## 1. Dependency map

```
              ┌──────────────────────────────────────────────┐
              │ Phase 0 — Schema + flags + fixtures          │
              │ (033, 034, 035, 036, 037 migrations)          │
              │ (RESEARCH_* env flags default false)          │
              └──────────────────────┬────────────────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         │                           │                           │
   Phase 1 — WS-1 audit         Phase 1 — WS-4 targets      Phase 1 — WS-3 snippets
   (parser fixtures,            (research_targets table,   (snippet_blobs table,
    selector-config export,      self-target migration,     snippet_tags seed,
    telemetry writes)            target state, picker,      POST /snippet with text)
         │                       breadcrumbs)
         │                           │                           │
         └──────────────┬────────────┴───────────────┬───────────┘
                        │                            │
                 Phase 2 — WS-2 visibility    Phase 2 — WS-5 Wayback + EDGAR
                 (parse result panel,         (first two connectors only;
                  diff panel, unmatched        others come in Phase 3)
                  DOM, regression report)
                        │                            │
                        └──────────────┬─────────────┘
                                       │
                            Phase 3 — WS-5 rest (RSS, news, blog, podcast)
                                       │
                                       │
                            Phase 4 — WS-6 focus polish
                                       │
                            Phase 5 — Evidence-aware scoring (optional)
                                       │
                            Phase 6 — Hardening, docs, release
```

Phase 0 is a hard gate. Phase 1 has three parallel tracks. Phase 2 cannot start any of its items until their Phase 1 dependency is merged.

## 2. Phase 0 — Schema + flags + fixtures

**Goal**: land the migrations and flag infrastructure so downstream work is unblocked.

### 2.1 Deliverables

- [x] `data/db/init/033-parse-telemetry.sql`
- [x] `data/db/init/034-snippets-schema.sql`
- [x] `data/db/init/035-targets-schema.sql`
- [x] `data/db/init/036-sources-schema.sql`
- [x] `data/db/init/037-research-rls.sql`
- [x] `docker-compose.yml` adds `RESEARCH_*` env pass-through (mirroring the `ECC_*` pattern in v0.5.0).
- [x] `app/src/lib/config/research-flags.ts` — single source for flag reads; all adapters check via this module.
- [x] Fixture-sourcing helper `scripts/capture-fixture.ts` with redaction.
- [x] First fixture corpus committed under `data/parser-fixtures/` (14 files committed, 2 per page type).
- [x] Seed data for `snippet_tags` (22 slugs — corrected up from 18; matches WS-3 §6.1 source).
- [x] ADR-027 through ADR-033 committed under `docs/adr/`.

### 2.2 Sequencing

Day 1 — migrations. Verify in Docker local stack that all tables create cleanly on a fresh volume, per the `docs/development_notes/ecc/runtime-verification.md` Step 3 pattern.

Day 2 — flags + fixtures + ADRs. This is the gate; nothing past Phase 0 begins until ADRs are reviewed.

### 2.3 Size: ~1 week, 1 engineer

### 2.4 Risks

- **Migration on existing volumes**: same concern as ECC sprint. If a dev volume pre-dates these migrations, they won't re-run. Documented — `docker compose down -v` is the expected reset.
- **RLS policy mistakes**: copy-paste from `030-ecc-rls.sql` carefully; run the tenant-isolation tests before merging.

## 3. Phase 1 — three parallel tracks

### 3.1 Track A — WS-1 audit + telemetry

**Goal**: baseline parser yield published, telemetry writes live, fallback registry in place.

Deliverables (all in `01-parser-audit.md` acceptance):

- [x] `data/parser-fixtures/` corpus complete (14 files per §3.1).
- [x] `tests/parser/fixtures.test.ts` runs green with golden snapshots.
- [x] `app/src/lib/parser/telemetry.ts` writes `parse_field_outcomes` rows.
- [x] `app/src/lib/parser/unmatched-dom.ts` populates `ParseResult.unmatched`.
- [x] Fallback registry wired into all six parsers.
- [x] Baseline report `docs/development_notes/parser-audit-2026-Q2.md` published (Phase 1.5 update at `parser-audit-2026-Q2-update.md`).
- [x] `/admin/parsers` page renders yield table.
- [x] `POST /api/parser/regression-report` wired end-to-end.

Size: ~2 weeks, 1 engineer.

### 3.2 Track B — WS-4 targets (master)

**Goal**: research_targets + state + breadcrumbs live; all existing pages continue to work because default primary target is self.

- [x] Self-target migration runs idempotently (DO-block with NOT EXISTS).
- [x] `research_target_state` read/written by every page load (server component).
- [x] Breadcrumbs render globally.
- [x] Target picker keyboard shortcut (`T`).
- [x] `/graph` accepts `?primaryTargetId=` and re-roots.
- [x] Scoring pipeline accepts `targetId`; `DEFAULT_TENANT_ID` constant deleted from causal-graph/scoring-adapter (similar constants in impulses/cognitive-tick adapters still present — tracked for future cleanup).
- [x] Seed lenses (3) created.
- [x] RLS test: two tenants cannot see each other's targets.

Size: ~3 weeks, 1 engineer + 1 part-time frontend.

### 3.3 Track C — WS-3 snippets (text-only first)

**Goal**: text snippets round-trip from extension to `causal_nodes`. Image, link, marquee deferred to Phase 1.5.

- [x] Content script injected under `optional_host_permissions`.
- [x] Widget UI: select text → expand card → save.
- [x] Entity resolution dropdown for proper-noun bigrams (existing contacts only; "create new" deferred to Phase 1.5 — still pending).
- [x] `POST /api/extension/snippet` works for text kind.
- [x] `causal_nodes` rows created with proper edges.
- [x] ExoChain entry appended under snippet chain per target (`snippet:${kind}:${id}`; migration 038 widened chain_id to TEXT).
- [x] Main-app snippets panel renders list.
- [x] Tag taxonomy seeded and selectable.

Size: ~3 weeks, 1 engineer.

### 3.4 Phase 1.5 — small fill-in

Before Phase 2 begins, close two short follow-ups:

- [x] WS-3 image snippet round-trip (uses `snippet_blobs`). ~3 days. **Shipped** via PR #19.
- [ ] WS-3 link snippet with async source_records resolution (depends on Phase 2 WS-5 partial progress; feature-gate). **Still pending** — unblocked now that WS-5 is on main.
- [x] WS-4 ICP plumbing per-target. ~3 days. **Shipped** via PR #17 (lens-driven scoring).
- [ ] **Follow-ups surfaced during Phase 1:** parser quick wins (COMPANY.founded/employeesOnLinkedIn, SEARCH_CONTENT parser, FEED.postedTimeAgo/reposts/postType) — **shipped** via PR #18. `getDefaultTenantId` consolidated to `app/src/lib/db/tenants.ts` — **shipped** via PR #18.
- [ ] WS-3 "create new contact" from mention dropdown + LinkedIn-only enrichment on create (per Q9 A+C) — **still pending**.
- [ ] WS-3 `/api/extension/contact/search` endpoint for mention dropdown — **still pending**.
- [ ] Consolidate remaining `DEFAULT_TENANT_ID` constants in `impulses/scoring-adapter.ts` and `cognitive-tick/claude-adapter.ts` — **still pending**.
- [ ] Rename `research_target_icps` + `research_target_state` columns to expose lens_id/last_used_lens_id (currently Phase 1.5 ICP plumbing uses `research_lenses.config.icpProfileIds[]` + `is_default` as a workaround per Track agent notes).

## 4. Phase 2 — parallel two

### 4.1 Track D — WS-2 visibility

Depends on WS-1 telemetry writing (Phase 1 Track A).

- [x] Sidebar Parse Result panel.
- [x] Capture Diff panel with projections.
- [x] Unmatched DOM panel.
- [x] Regression report button.
- [x] WebSocket path for parse-complete notifications (fixes `ws-server.ts:34` pong while we're in there).
- [x] Analytics events.

Size: ~2 weeks, 1 engineer (sidebar-heavy).

### 4.2 Track E — WS-5 Wayback + EDGAR

Both connectors together — they share rate-limiter, robots, URL normalization. The other connectors reuse the same scaffolding in Phase 3.

- [x] `app/src/lib/sources/` scaffolding (types, registry, rate-limit, robots, url-normalize, service, cron-auth — 8 modules).
- [x] Wayback connector end-to-end.
- [x] EDGAR connector end-to-end (submissions API + 10-K item extraction — Risk Factors + Directors/Officers).
- [x] Wayback-of-LinkedIn auto-reparse into `page_cache` (the high-value path for US-1).
- [x] `/sources` admin page + target source panel.
- [x] Cron endpoints for Wayback seed + EDGAR backfill.

Size: ~3 weeks, 1 engineer.

## 5. Phase 3 — rest of source connectors

RSS, news, blog, podcast. Each is independently shippable and gated by its per-connector flag.

- [ ] `RESEARCH_SOURCE_RSS=true` on in staging; poll once. *(ops-side toggle; code ready via PR #22.)*
- [x] Google News fallback path.
- [x] Targeted news scrapers (WSJ, Bloomberg, Reuters, TechCrunch, CNBC).
- [x] Corporate blog connector (RSS + sitemap fallback).
- [x] Podcast connector (RSS with `<podcast:transcript>` support; user-uploaded transcripts).
- [x] **RSS core connector** (not in original list but shipped as part of Track F for the family).

Size: ~3 weeks, 1 engineer.

Phase 2 Track E and Phase 3 can run with one engineer back-to-back or parallel if staffing permits.

## 6. Phase 4 — WS-6 focus polish

Items that touch all prior work and only make sense after the primitives exist.

- [x] Lens system UI (save + load + share). *(Phase 4 Track H / PR #25 — open, awaiting merge.)*
- [x] Graph re-center latency optimization to hit 200 ms p95. *(Phase 4 Track I / PR #24 — measured warm p95 = 1ms, cold p95 = 22ms.)*
- [x] Default-hide provenance edges + lens toggle to show them. *(Phase 4 Track I / PR #24.)*
- [x] Two-column dashboard when secondary is set. *(Phase 4 Track I / PR #24.)*
- [x] Delta highlighting threshold 20% tunable. *(Phase 4 Track I / PR #24 — `owner_profiles.delta_highlight_threshold` via migration 043.)*
- [x] Back-stack breadcrumb hover details (switch source, time). *(Phase 4 Track H / PR #25 — `research_target_state.history` JSONB ring-buffer cap 20.)*
- [x] Saved lens sharing (URL deep-link encodes lens config). *(Phase 4 Track H / PR #25 — `?lens=<id>` same-tenant and `?lens=opaque:<base64>` cross-tenant.)*

Size: ~2 weeks, 1 frontend engineer.

## 7. Phase 5 — evidence-aware scoring (optional)

Flagged `SCORE_EVIDENCE_DEPTH=false` default. If time permits:

- [ ] New scoring dimension `EVIDENCE_DEPTH` using `log(1 + count of evidence_for edges)`.
- [ ] Plumbing through the ECC scoring adapter so evidence count appears in causal graphs.
- [ ] Admin toggle.

Size: ~3 days.

Cut first if schedule pressure.

## 8. Phase 6 — hardening + docs + release

- [ ] End-to-end scenario tests for each of the 5 user stories in `00-sprint-overview.md`.
- [ ] Performance pass against budgets in `07-architecture-and-schema.md` §8.
- [ ] Documentation in `docs/content/docs/research-tools/*` with per-feature pages (mirroring `docs/content/docs/browser-extension/` style).
- [ ] Update `docs/content/docs/browser-extension/target-panel.mdx` to reflect server-persisted pin.
- [ ] Update `docs/content/docs/browser-extension/capturing-pages.mdx` for new post-capture events.
- [ ] Update the `runtime-verification.md` runbook to include snippet + source chain verification.
- [ ] Gate flip: turn flags on in staging, run all 5 scenarios by hand.
- [ ] Changelog entry.

Size: ~1.5 weeks.

## 9. Critical path

```
  Phase 0 migrations  (1 week)
        │
        ▼
  Phase 1 Track B: targets (3 weeks)  ← gates everything target-scoped
        │
        ▼
  Phase 1 Track A + Track C finish    (overlaps; 2–3 weeks)
        │
        ▼
  Phase 2 tracks D + E                 (3 weeks; tracks run parallel)
        │
        ▼
  Phase 3 source connectors            (3 weeks)
        │
        ▼
  Phase 4 focus polish                 (2 weeks)
        │
        ▼
  Phase 6 hardening                    (1.5 weeks)

  Critical path ≈ 1 + 3 + 3 + 3 + 2 + 1.5 = 13.5 weeks ≈ 3 calendar months.

  With full parallelism on A/B/C in Phase 1, and D/E in Phase 2: same 13.5 weeks (B is always on the critical path because downstream depends on targets).
```

Phase 5 (evidence-aware scoring) runs off critical path when it runs.

## 10. Parallelism and staffing

Minimum viable staffing: 2 engineers. Tracks A and C can run sequentially on engineer 1; Track B (targets) on engineer 2. Phase 2 tracks D and E can then run sequentially.

Optimal staffing: 3 engineers + 1 frontend.
- Eng 1: B → D → polish.
- Eng 2: A → E.
- Eng 3: C → E (pair with Eng 2).
- Frontend: sidebar + breadcrumbs + graph re-center + lens UI.

Delivery date estimates assume one full-time engineer on the critical path. Calendar time compresses to ~9 weeks with the optimal staffing.

## 11. Per-phase acceptance gate

Before moving to the next phase:

1. All "Acceptance checklist" items in the owning WS doc are ticked.
2. `npm run build`, `npm test`, `npm run lint` all green.
3. New migrations verified on a fresh Docker volume (pattern from `runtime-verification.md`).
4. Feature flags flipped on/off do not break existing behavior (regression test).
5. Performance budgets met for the operations in scope for the phase.

## 12. Risk to schedule

| Risk | Likely impact | Mitigation |
|------|--------------|------------|
| LinkedIn CSS churn during Phase 1 Track A | Parser yield regresses, team distracted | Our telemetry + fixture corpus is built exactly to surface this fast; short-term fix is a fallback addition. |
| Extension permission model pushback in review | Phase 1 Track C slips | Write a short security brief before review; the on-demand permission model is the concession. |
| EDGAR rate-limiting bans IP during Phase 2 Track E | Connector halts | Token-bucket enforced at 10 rps; tests run against a VCR-style cassette to avoid re-hitting SEC in CI. |
| Source `content` bytea column balloons | DB cost concern | 5 MB cap + §§6 retention considerations. Budget tables (`012-budget-schema.sql`) already track per-tenant usage. |
| Graph re-center p95 above 200 ms on realistic data | UX regression on WS-6 | Pre-fetch primary target's N-hop neighborhood; cache in existing `caches` table (`013-cache-graph-schema.sql`). |
| Scope creep on LLM-assisted entity resolution in WS-3 | Sprint doubles | Document as future work (WS-3 §16 equivalent). Do not ship LLM calls this sprint. |

## 13. Entry + exit criteria

### Entry

- v0.5.0 is released and stable in production (per `release-v0.5.0.md`).
- Extension sidebar Target Panel v1 (v0.5.0) has been used by at least one real user for one week.
- Doctest: `docs/development_notes/ecc/runtime-verification.md` has been run successfully — verifies ECC substrate is live.

### Exit (end of Phase 6)

- All 5 user stories from `00-sprint-overview.md` demo end-to-end.
- Feature flags default off; one staging env has them all on.
- Parser yield meets targets in `01-parser-audit.md` §7 on the fixture corpus.
- Graph re-center p95 ≤ 200 ms on realistic test data.
- Regression reports produce fixtures that land in the tracked corpus (one complete cycle).
- Documentation published at `/docs/research-tools/*`.

## 14. Linked files

- `.planning/ecc-sprint/phase-orchestration.md` — template for phase notes.
- `.planning/ecc-sprint/phase-1-plan.md` — reference for per-track planning format.
- `00-sprint-overview.md` — user stories that gate exit.
- Per-WS docs — ownership and detailed acceptance.
- `07-architecture-and-schema.md` — migrations all referenced here.
