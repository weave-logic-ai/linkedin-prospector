# Stub & TODO Inventory

Generated: 2026-04-17
Total stubs: 8
Total TODOs: 2
Silent empty catch blocks (notable): 28+ (a representative sample listed under P2)

Scope: `app/src/**`, `browser/src/**`, `agent/**` (v2 only), `data/db/init/*.sql`.
The `.v1-archive/` subtree under `agent/network-navigator/skills/linkedin-prospector/scripts/` is archived code and is listed separately at the bottom for completeness but is not counted in the totals.

## By Priority

### P0 — Blocking / production risk
- `app/src/lib/ecc/causal-graph/scoring-adapter.ts:7` — Hardcoded `DEFAULT_TENANT_ID = 'default'` instead of resolving from request context; all ECC causal-graph rows written under a fake tenant, breaks multi-tenant isolation.
- `app/src/lib/ecc/impulses/dispatcher.ts:88` — Webhook handler branch returns `{ skipped: true, reason: 'webhook handler not yet implemented' }`; any configured webhook impulse handler silently no-ops.

### P1 — Visible user impact
- `app/src/lib/db/queries/offerings.ts:1` — File header marks the whole module as a stub ("will be replaced by DB agent"); offering CRUD is live but flagged as provisional.
- `app/src/lib/ecc/impulses/handlers/notification.ts:5` — Handler is a stub; `email` and `webhook` channels log only and return `{ sent: false, reason: 'not_implemented' }`.
- `app/src/lib/ecc/impulses/handlers/notification.ts:19-22` — `email` channel is unimplemented; would-be emails are discarded.
- `app/src/lib/ecc/impulses/handlers/notification.ts:24-27` — `webhook` channel is unimplemented; would-be webhook POSTs are discarded.
- `app/src/lib/ecc/impulses/handlers/campaign-enroller.ts:6` — Header marks handler as a stub implementation; current logic does basic insert but lacks richer enrollment config handling promised in comment.

### P2 — Nice to have / cleanup
- `app/src/lib/websocket/ws-server.ts:34` — Dead constant `PONG_TIMEOUT_MS` commented out ("Reserved for future heartbeat enhancement"); heartbeat timeout never enforced.
- `app/src/lib/scoring/types.ts:18` — Comment marks referral scoring block as Phase 3; confirm this is current (Phase 2 already lands referral elsewhere).
- `app/src/lib/scoring/pipeline.ts:3,91,216` — Inline Phase 2 annotations; cleanup once referral is stable.
- `app/src/app/api/admin/reindex/route.ts:45,78` — Phase 2/3 comments inside the reindex pipeline; verify the phased work is complete before removing.
- `app/src/app/api/dashboard/route.ts:250` — Phase 3 additions comment marker; verify intended additions shipped.
- `app/src/app/api/enrichment/enrich/route.ts:3,155` — Comments label `dryRun=false` path as "legacy behavior"; slated for removal once UI fully migrates.

#### Empty `catch {}` blocks with no handling (silent-failure risk)
Representative sample — many UI components swallow errors without reporting. Consider wiring to toast/log.
- `app/src/components/discover/people-panel.tsx:90,122,137,154` — Search, score, bulk-score, bulk-enrich errors swallowed (`/* network error */`, `/* silent */`).
- `app/src/components/goals/goal-toaster.tsx:58,67` — Goal toast fetch errors labeled `// silent`.
- `app/src/components/admin/rvf-training.tsx:43,70` — Training fetch errors labeled `// ignore`.
- `app/src/components/discover/niche-builder-modal.tsx:154` — Modal submit failure swallowed (`// ignore`).
- `app/src/components/discover/history-panel.tsx:83,102,116` — History fetch / detail errors swallowed (`/* detail unavailable */`).
- `app/src/app/(app)/tasks/page.tsx:451,463,475,519,532,541,572,585,595,647` — Ten handlers on the Tasks page swallow fetch errors with `// silent`.
- `app/src/app/(app)/outreach/page.tsx:143,153,163` — Three outreach handlers swallow errors (`/* ignore */`).
- `app/src/app/(app)/discover/page.tsx:141` — Discover page swallows error (`// ignore`).
- `app/src/app/(app)/network/page.tsx:39` — Network page swallows fetch failure (`// silent`).
- `app/src/app/(app)/enrichment/page.tsx:137` — Enrichment page swallows (`// ignore`).

## By Module

### app/src/lib/ecc/causal-graph
- `scoring-adapter.ts:7` — Replace `DEFAULT_TENANT_ID` constant with proper tenant resolution from request context (auth/session).

### app/src/lib/ecc/impulses
- `dispatcher.ts:88` — Implement `webhook` handler branch or remove the handler type from config surface.
- `handlers/notification.ts:5` — Replace stub with real email and websocket providers.
- `handlers/notification.ts:19` — Implement `email` channel (service integration).
- `handlers/notification.ts:25` — Implement `webhook` channel (outbound POST with retries).
- `handlers/campaign-enroller.ts:6` — Expand stub logic: per-handler campaign routing, richer status/step mapping.

### app/src/lib/db/queries
- `offerings.ts:1` — Header declares module as a stub awaiting DB agent takeover; confirm or remove banner.

### app/src/lib/websocket
- `ws-server.ts:34` — Reinstate `PONG_TIMEOUT_MS`-based heartbeat timeout or delete the comment.

### app/src/lib/scoring
- `types.ts:18` — Clarify `Phase 3` scope for referral scoring types.
- `pipeline.ts:3,91,216` — Remove `Phase 2` annotations after referral pipeline is generally available.

### app/src/app/api
- `admin/reindex/route.ts:45,78` — `Phase 2`/`Phase 3` reindex annotations; confirm complete.
- `dashboard/route.ts:250` — `Phase 3 additions` annotation; confirm complete.
- `enrichment/enrich/route.ts:3,155` — Remove the `legacy behavior` auto-apply path once UI migrates.

### app/src/app/(app) — UI pages with swallowed errors
- `tasks/page.tsx`, `outreach/page.tsx`, `discover/page.tsx`, `network/page.tsx`, `enrichment/page.tsx` — Multiple `catch { // silent }` blocks lose failure signals.

### app/src/components — components with swallowed errors
- `discover/people-panel.tsx`, `goals/goal-toaster.tsx`, `admin/rvf-training.tsx`, `admin/data-tab.tsx`, `discover/niche-builder-modal.tsx`, `discover/history-panel.tsx` — Silent catches on user-facing actions.

### browser/src
- No stubs, TODOs, or unimplemented placeholders found. Matches for "placeholder" are legitimate UI input/HTML `placeholder` attributes.

### agent/network-navigator (v2, non-archive)
- No stubs or TODOs in live v2 skill code.

### data/db/init/*.sql
- No TODO/FIXME/stub markers across all 32 schema files (001 through 032).

## Archived (not counted in totals)
The `.v1-archive/` subtree contains planned-Phase-2 placeholders in legacy code. These are deprecated and not in use:
- `agent/network-navigator/skills/linkedin-prospector/scripts/.v1-archive/pipeline.mjs:13,624,626` — "Phase 2 - not yet implemented", "Phase 2 placeholder", "Visualization is not yet implemented (Phase 2)".
