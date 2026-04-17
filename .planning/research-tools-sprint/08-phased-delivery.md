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

- [ ] `data/db/init/033-parse-telemetry.sql`
- [ ] `data/db/init/034-snippets-schema.sql`
- [ ] `data/db/init/035-targets-schema.sql`
- [ ] `data/db/init/036-sources-schema.sql`
- [ ] `data/db/init/037-research-rls.sql`
- [ ] `docker-compose.yml` adds `RESEARCH_*` env pass-through (mirroring the `ECC_*` pattern in v0.5.0).
- [ ] `app/src/lib/config/research-flags.ts` — single source for flag reads; all adapters check via this module.
- [ ] Fixture-sourcing helper `scripts/capture-fixture.ts` with redaction.
- [ ] First fixture corpus committed under `data/parser-fixtures/` (minimum 2 per page type).
- [ ] Seed data for `snippet_tags` (18 seeded slugs from WS-3 §6.1).
- [ ] ADR-027 through ADR-033 committed under `docs/adr/`.

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

- [ ] `data/parser-fixtures/` corpus complete (13+ files per §3.1).
- [ ] `tests/parser/fixtures.test.ts` runs green with golden snapshots.
- [ ] `app/src/lib/parser/telemetry.ts` writes `parse_field_outcomes` rows.
- [ ] `app/src/lib/parser/unmatched-dom.ts` populates `ParseResult.unmatched`.
- [ ] Fallback registry wired into all six parsers.
- [ ] Baseline report `docs/development_notes/parser-audit-2026-Q2.md` published.
- [ ] `/admin/parsers` page renders yield table.
- [ ] `POST /api/parser/regression-report` wired end-to-end.

Size: ~2 weeks, 1 engineer.

### 3.2 Track B — WS-4 targets (master)

**Goal**: research_targets + state + breadcrumbs live; all existing pages continue to work because default primary target is self.

- [ ] Self-target migration runs idempotently.
- [ ] `research_target_state` read/written by every page load (server component).
- [ ] Breadcrumbs render globally.
- [ ] Target picker keyboard shortcut (`T`).
- [ ] `/graph` accepts `?primaryTargetId=` and re-roots.
- [ ] Scoring pipeline accepts `targetId`; `DEFAULT_TENANT_ID` constant deleted.
- [ ] Seed lenses (3) created.
- [ ] RLS test: two tenants cannot see each other's targets.

Size: ~3 weeks, 1 engineer + 1 part-time frontend.

### 3.3 Track C — WS-3 snippets (text-only first)

**Goal**: text snippets round-trip from extension to `causal_nodes`. Image, link, marquee deferred to Phase 1.5.

- [ ] Content script injected under `optional_host_permissions`.
- [ ] Widget UI: select text → expand card → save.
- [ ] Entity resolution dropdown for proper-noun bigrams (existing contacts only; "create new" deferred).
- [ ] `POST /api/extension/snippet` works for text kind.
- [ ] `causal_nodes` rows created with proper edges.
- [ ] ExoChain entry appended under snippet chain per target.
- [ ] Main-app snippets panel renders list.
- [ ] Tag taxonomy seeded and selectable.

Size: ~3 weeks, 1 engineer.

### 3.4 Phase 1.5 — small fill-in

Before Phase 2 begins, close two short follow-ups:

- WS-3 image snippet round-trip (uses `snippet_blobs`). ~3 days.
- WS-3 link snippet with async source_records resolution (depends on Phase 2 WS-5 partial progress; feature-gate).
- WS-4 ICP plumbing per-target. ~3 days.

## 4. Phase 2 — parallel two

### 4.1 Track D — WS-2 visibility

Depends on WS-1 telemetry writing (Phase 1 Track A).

- [ ] Sidebar Parse Result panel.
- [ ] Capture Diff panel with projections.
- [ ] Unmatched DOM panel.
- [ ] Regression report button.
- [ ] WebSocket path for parse-complete notifications (fixes `ws-server.ts:34` pong while we're in there).
- [ ] Analytics events.

Size: ~2 weeks, 1 engineer (sidebar-heavy).

### 4.2 Track E — WS-5 Wayback + EDGAR

Both connectors together — they share rate-limiter, robots, URL normalization. The other connectors reuse the same scaffolding in Phase 3.

- [ ] `app/src/lib/sources/` scaffolding (types, registry, rate-limit, robots, url-normalize).
- [ ] Wayback connector end-to-end.
- [ ] EDGAR connector end-to-end (submissions API + 10-K item extraction).
- [ ] Wayback-of-LinkedIn auto-reparse into `page_cache` (the high-value path for US-1).
- [ ] `/sources` admin page + target source panel.
- [ ] Cron endpoints for Wayback seed + EDGAR backfill.

Size: ~3 weeks, 1 engineer.

## 5. Phase 3 — rest of source connectors

RSS, news, blog, podcast. Each is independently shippable and gated by its per-connector flag.

- [ ] `RESEARCH_SOURCE_RSS=true` on in staging; poll once.
- [ ] Google News fallback path.
- [ ] Targeted news scrapers (WSJ, Bloomberg, Reuters, TechCrunch, CNBC).
- [ ] Corporate blog connector (RSS + sitemap fallback).
- [ ] Podcast connector (RSS with `<podcast:transcript>` support; user-uploaded transcripts).

Size: ~3 weeks, 1 engineer.

Phase 2 Track E and Phase 3 can run with one engineer back-to-back or parallel if staffing permits.

## 6. Phase 4 — WS-6 focus polish

Items that touch all prior work and only make sense after the primitives exist.

- [ ] Lens system UI (save + load + share).
- [ ] Graph re-center latency optimization to hit 200 ms p95.
- [ ] Default-hide provenance edges + lens toggle to show them.
- [ ] Two-column dashboard when secondary is set.
- [ ] Delta highlighting threshold 20% tunable.
- [ ] Back-stack breadcrumb hover details (switch source, time).
- [ ] Saved lens sharing (URL deep-link encodes lens config).

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
