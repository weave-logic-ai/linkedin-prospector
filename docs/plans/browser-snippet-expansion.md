# Browser Extension — Snippet & Diff Expansion Plan

**Status**: Deferred planning doc (not in current take)
**Date**: 2026-04-17
**Scope**: Snippet editor, capture diff view, parsing feedback. These were pulled out of the "sidebar target panel" take to keep that one focused.

---

## What belongs here (not in current sprint)

### 1. Snippet editor

The extension should let the user capture arbitrary content from **any** page — LinkedIn, Wayback Machine, SEC EDGAR, press release pages, corporate filings — and attach it as evidence to the currently-targeted entity (person or company).

Open questions to resolve before implementation:
- **Multi-modal**: text selection, image regions, link harvesting. Do we store images inline (base64 / blob) or upload to object storage and reference?
- **Tag / meta / link**: each snippet needs structured meta — type (role history / achievement / quote / filing / news / note), date the evidence refers to (not just captured_at), source trust score, optional link to a named entity mentioned in the snippet. Tags should be user-editable and suggestable.
- **Entity resolution inside snippets**: if a snippet mentions another person ("CEO Jane Doe"), we should offer to link that name to an existing contact or propose creating one.
- **Storage target**: snippets as their own table, OR as `causal_nodes` with `kind='evidence'` so they flow through the ECC graph naturally. The second is ideal — it means evidence contributes to provenance and counterfactual replay — but costs a bigger schema/adapter change.
- **Permissions**: expanding `host_permissions` from linkedin-only to `<all_urls>` changes the trust posture; consider on-demand permission request per site, or a separate "snip mode" the user toggles.
- **Selection UX**: hotkey, context menu, draggable marquee, or all three. Need a floating "send to target" widget that's lightweight and non-intrusive.

Rough file map (for later):
- `browser/src/content/snippet-bridge.ts` — selection listener + marquee widget (thin, any-page)
- `browser/src/sidepanel/snippet-editor.ts` — editor UI in the side panel
- `app/src/app/api/extension/snippet/route.ts` — POST endpoint
- `data/db/init/033-snippets-schema.sql` — table + FK + tags + meta, OR extend `causal_nodes`
- `app/src/lib/ecc/causal-graph/evidence-adapter.ts` — if routing through ECC

### 2. Capture diff view

After a capture confirms for the currently-targeted entity, render a "What changed" block:
- Added fields (green)
- Changed values (old → new, inline)
- Disappeared fields (strike-through, yellow)

Requires: pre-capture snapshot held in the sidebar + a new `GET /api/extension/entity/:type/:id/diff?since=<captureId>` endpoint returning the before/after projection.

Non-trivial because the parser upserts into multiple tables (contacts, positions, skills, endorsements). The diff has to be semantic — not just one row — so the endpoint needs to assemble a canonical projection per entity type and compare.

### 3. Parsing feedback

Show, per capture, what the parser actually extracted vs. what it couldn't match. Unmatched sections should surface so the user can flag missing selectors. This overlaps with the parsing-audit sprint we'll run later — best done together.

---

## What's staying in the current take (not in this doc)

- Sidebar target panel (auto-lock on PROFILE / COMPANY pages, task-locked when a task is active)
- Target-assumed UI feedback: always show WHO the sidebar is currently targeting, how the lock was set (page auto, task, or pinned), and an unpin / switch control
- Existing data readout for the pinned entity (no diff, no snippets yet)
- Browser-side auto-pagination click-through (on top of the already-complete server-side task creation)

---

## Future sprint grouping

These three items live in the same separate sprint:

1. **Parsing rethink** — per-parser audit driven by captured fixtures, selector config hardening, missed-section reporting.
2. **Graph re-centering** — click any node to make it the center of the graph; query and rendering reorient around it.
3. **Primary/secondary target architecture** — make target a first-class concept: `primary_target` can be self OR a contact OR a company; optional `secondary_target` enables differential analysis (MTP / signaling / style deltas). Everything downstream — ICP computation, scoring, graph views, ECC provenance — scopes against the chosen target.

Why together: the target model refactor makes the graph re-centering trivial, and the parsing work is what makes non-self targets viable (you need high parser yield on unfamiliar entities before you can analyze them well).

Entry criterion: current take (sidebar targeting + existing-data readout + auto-pagination) ships and is stable.
