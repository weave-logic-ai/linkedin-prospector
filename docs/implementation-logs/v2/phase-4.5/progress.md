# Phase 4.5: Discover Redesign — Progress Log

## Steps

- [x] **Step 1**: DB schemas — offerings, action_log, niche scoring columns
  - Created: db/init/018-phase45-schema.sql
  - Created: app/src/lib/db/queries/action-log.ts (recordAction, listActions, getAction, revertAction)
  - Created: app/src/lib/db/queries/offerings.ts (list, create, update, delete)
  - Applied migration to running DB, seed data verified
- [x] **Step 2**: Offerings CRUD API + action log API
  - Created: app/src/app/api/offerings/route.ts (GET list, POST create)
  - Created: app/src/app/api/offerings/[id]/route.ts (PUT update, DELETE)
  - Created: app/src/app/api/actions/route.ts (GET list with filters)
  - Created: app/src/app/api/actions/[id]/route.ts (GET detail, POST revert)
- [x] **Step 3**: Discover layout overhaul — new grid, panels, tabs
  - Rewrote: app/src/app/(app)/discover/page.tsx
  - New layout: Niche/ICP dropdowns, Offerings multi-select, tabs (Wedge/Treemap/Niches/ICPs)
  - Bottom row: People + History panels (50/50)
  - Removed SupportingCharts, removed Discover ICPs button
- [x] **Step 4**: Niches tab — CRUD table + Niche Builder modal
  - Created: app/src/lib/db/queries/niches.ts
  - Created: app/src/app/api/niches/route.ts + [id]/route.ts
  - Created: app/src/components/discover/niches-table.tsx
  - Created: app/src/components/discover/niche-builder-modal.tsx
  - Scoring: Affordability/Fitability/Buildability (1-5) with visual indicators
- [x] **Step 5**: ICPs tab — CRUD table + ICP Builder modal
  - Created: app/src/lib/db/queries/icps.ts
  - Created: app/src/app/api/icps/route.ts + [id]/route.ts
  - Created: app/src/components/discover/icps-table.tsx
  - Created: app/src/components/discover/icp-builder-modal.tsx
- [x] **Step 6**: People panel — filtered sortable table with bulk actions
  - Created: app/src/components/discover/people-panel.tsx
  - Features: search, sort, pagination, checkboxes, bulk Score/Enrich/Expand
  - Uses TierBadge component, linked contact names
- [x] **Step 7**: History panel — action_log display with revert
  - Created: app/src/components/discover/history-panel.tsx
  - Features: expandable rows, before/after diff, revert with confirmation, type-colored badges
- [x] **Step 8**: Auto-scoring hooks — after enrichment/import
  - Created: app/src/lib/scoring/auto-score.ts (triggerAutoScore, triggerBatchAutoScore)
  - Updated: app/src/app/api/enrichment/enrich/route.ts (auto-score + action_log on dryRun=false)
  - Updated: app/src/app/api/enrichment/apply/route.ts (auto-score + action_log on apply)
- [x] **Step 9**: Expand Network — task creation for 2nd-degree search
  - Created: app/src/app/api/tasks/route.ts (GET list, POST create)
  - Updated: people-panel.tsx Expand Network button → creates tasks per selected contact
  - Task includes LinkedIn search URL, contact context, priority 3

## Completion

All 9 steps complete. Phase 4.5 is done.

Build verified: tsc clean, lint clean, Next.js build passes, deployed to container.

## Files Created/Modified

### New files
- db/init/018-phase45-schema.sql
- app/src/lib/db/queries/action-log.ts
- app/src/lib/db/queries/offerings.ts
- app/src/lib/db/queries/niches.ts
- app/src/lib/db/queries/icps.ts
- app/src/lib/scoring/auto-score.ts
- app/src/app/api/offerings/route.ts
- app/src/app/api/offerings/[id]/route.ts
- app/src/app/api/actions/route.ts
- app/src/app/api/actions/[id]/route.ts
- app/src/app/api/niches/route.ts
- app/src/app/api/niches/[id]/route.ts
- app/src/app/api/icps/route.ts
- app/src/app/api/icps/[id]/route.ts
- app/src/app/api/tasks/route.ts
- app/src/components/discover/niches-table.tsx
- app/src/components/discover/niche-builder-modal.tsx
- app/src/components/discover/icps-table.tsx
- app/src/components/discover/icp-builder-modal.tsx
- app/src/components/discover/people-panel.tsx
- app/src/components/discover/history-panel.tsx

### Modified files
- app/src/app/(app)/discover/page.tsx (full rewrite)
- app/src/app/api/enrichment/enrich/route.ts (auto-score + action_log)
- app/src/app/api/enrichment/apply/route.ts (auto-score + action_log)

## Dev Notes

- See `docs/plans/discover-redesign.md` for full design spec
- See `docs/market-segment-niche-icp.md` for hierarchy model
- Offerings seeded: Fractional CTO, Automation Assessment, Agentic Development Pipeline
- action_log supports full before/after snapshots + user choices for time-machine undo
- Auto-scoring is fire-and-forget (doesn't block enrichment response)
