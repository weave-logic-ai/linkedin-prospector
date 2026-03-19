# Discover Page Redesign Plan

## Layout

### Current
```
[Niche Panel 220px] [Tabs: Wedge | Treemap | Builder] [ICP Panel 220px]
[                    SupportingCharts (3 graphs)                       ]
```

### New
```
[  Niche (dropdown)  ]  [Tabs: Wedge | Treemap | Niches | ICPs ]
[  ICP Profile (dd)  ]
[  Offerings (editable dropdown, multi-select)                  ]

[     People (50%)              ] [     History (50%)           ]
[ Sortable table, checkboxes,  ] [ Time-machine action log     ]
[ filtered by niche+ICP,       ] [ Full undo/redo              ]
[ bulk: Score, Enrich, Expand  ] [ Before/after snapshots      ]
```

## Changes

### Top area
- Remove "Discover ICPs" button
- Add "Offerings" editable dropdown (persisted, multi-select)
  - e.g., "Fractional CTO", "Automation Assessment", "Agentic Development Pipeline"
  - Selected offerings influence niche and ICP scoring

### Left panel (doubled width ~440px)
- "Niche" singular label + dropdown selector
- "ICP Profile" below niche dropdown
- Remove contact lists from panels (contacts show in People area below)

### Center tabs
- Keep: Wedge, Treemap
- Remove: ICP Builder tab (→ becomes modal)
- Add: **Niches** tab — CRUD table of niches with scores (Affordability, Fitability, Buildability)
- Add: **ICPs** tab — CRUD table of ICP profiles
- Modal: **Niche Builder** — create/edit niche with semantic suggestions from user profile + offerings
- Modal: **ICP Builder** — create/edit ICP (existing builder refactored into modal)

### Bottom row (replaces SupportingCharts)
- **People** (50% width) — sortable, filterable contact table
  - Filtered by selected Niche + ICP
  - Columns: name, title, company, score, tier, persona
  - Checkboxes for multi-select
  - Bulk actions: Score, Enrich, Expand Network
  - "Expand Network" creates a task to find 2nd-degree contacts
- **History** (50% width) — time-machine action log
  - All scoring, enrichment, import actions
  - Full before/after JSON snapshots
  - Undo/revert any action

## New DB Tables

### offerings
```sql
id UUID PK, name TEXT, description TEXT, is_active BOOLEAN,
created_at, updated_at
```

### action_log (time machine)
```sql
id UUID PK, action_type TEXT, actor TEXT,
target_type TEXT, target_id UUID,
before_snapshot JSONB, after_snapshot JSONB,
choices JSONB, metadata JSONB,
created_at, reverted_at TIMESTAMPTZ NULL
```

### Niche scoring columns (add to niche_profiles)
```sql
affordability INTEGER (1-5), fitability INTEGER (1-5), buildability INTEGER (1-5)
```

## Hierarchy (from market-segment-niche-icp.md)

Market → Segment → Niche → ICP → Person

- **Niche** = "Where do I play?" — narrow targetable slice
- **ICP** = "Who exactly do I serve?" — person-level buyer/decision-maker
- **Offering** = Services that connect niche pain to ICP need

## Scoring Integration

1. User's LinkedIn profile → retrospective niche analysis (what niches have they worked in?)
2. Offerings inform niche and ICP creation (semantic suggestions)
3. Niche + ICP filter the People list
4. Scoring uses ICP criteria + offerings to rank contacts
5. Enrichment fills data gaps → re-score → discover new network paths

## Build Order

1. **DB schemas**: offerings, action_log, niche scoring columns
2. **Offerings CRUD**: API + editable dropdown
3. **Discover layout overhaul**: new grid, panels, tabs
4. **Niches tab**: CRUD table + Niche Builder modal
5. **ICPs tab**: CRUD table + ICP Builder modal (refactor from tab)
6. **People panel**: filtered sortable table with bulk actions
7. **History panel**: action_log display with revert
8. **Auto-scoring hooks**: after enrichment/import
9. **Expand Network**: task creation for 2nd-degree search
