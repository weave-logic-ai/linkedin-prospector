# WS-2 — Visibility + Parsing Feedback

**Scope**: Make the parser's yield visible at capture time in the extension sidebar; show diffs between captures of the same entity; surface the unmatched-DOM blocks that WS-1 emits; let the user flag a regression in one click.
**Non-scope**: Any UI changes inside the main Next.js app (those live in WS-6). Re-architecting the capture pipeline. Adding new authentication flows.
**Depends on**: WS-1 (`parse_field_outcomes`, `ParseResult.unmatched`, per-field confidence persistence) and the existing sidebar Target Panel (`v0.5.0`, `docs/content/docs/browser-extension/target-panel.mdx`).

---

## 1. Why this work

The extension already captures HTML, sends it to the app, queues it for parsing, and rotates it through `page_cache`. What it does not do is tell the user anything about what happened afterwards. The user's own words describe the frustration: "see whats happening, change focus, etc." Today the only signal of parser success is that a contact row exists with some fields populated — a user has to bounce to the main app and navigate to the contact to learn that. When the parser silently drops a field, the user never learns at all.

WS-2 is the corrective. Everything the parser knows after a capture should be in the sidebar within two seconds of the capture completing.

## 2. What the sidebar looks like after this sprint

The existing Target Panel (`docs/content/docs/browser-extension/target-panel.mdx`) stays where it is — it is the source of truth for who the sidebar is oriented around. Three new panels sit under it:

```
┌─ Target Panel (existing) ─────────────────┐
│ [Task lock · Jane Doe]         [×]        │
│ Composite: 78 (silver) · 2 pending tasks   │
└────────────────────────────────────────────┘

┌─ Parse Result (NEW) ───────────────────────┐
│ Last capture: 12s ago · PROFILE · v2.0.0   │
│                                            │
│ Extracted (7/9)           Overall 0.81 ●●● │
│ ├─ ● name          "Jane Doe"       0.90   │
│ ├─ ● headline      "VP Eng at..."   0.85   │
│ ├─ ○ location      "San Francisco"  0.55   │
│ ├─ ● about         (1,240 chars)    0.80   │
│ ├─ ● connectionsCount  500+         0.90   │
│ ├─ ● profileImageUrl  (URL)         0.95   │
│ ├─ ○ experience    2 entries        0.65   │
│ ├─ ✗ education     —                —      │
│ └─ ✗ skills        —                —      │
│                                            │
│ [View full parse result ▾]                 │
└────────────────────────────────────────────┘

┌─ Capture Diff (NEW) ───────────────────────┐
│ Compared to capture 4 days ago:            │
│                                            │
│ ± title        "Sr Engineer" → "VP Eng"    │
│ + about         (added, 1,240 chars)       │
│ - skills        ["Rust","Go"] (removed)    │
│ = name, headline, location, image (same)   │
│                                            │
│ [Snapshot history ▾]                       │
└────────────────────────────────────────────┘

┌─ Unmatched DOM (NEW, collapsed) ───────────┐
│ ▸ 2 regions in the captured HTML were      │
│   not claimed by any selector or fallback  │
│   [Report as regression ▸]                 │
└────────────────────────────────────────────┘
```

Each panel is addressable by test-id and independently collapsible.

## 3. Data flow

### 3.1 Current capture pipeline (from `docs/content/docs/browser-extension/capturing-pages.mdx`)

```
content script  →  service worker  →  POST /api/extension/capture  →  page_cache row  →  parse queue  →  parseCachedPage  →  contact upsert  →  auto-score
```

Today the sidebar never learns about anything past the `POST /api/extension/capture` response, which is the shape documented at the bottom of `capturing-pages.mdx` (captureId, storedBytes, queuedForParsing, pageType). The parse runs asynchronously and emits nothing the extension can listen for.

### 3.2 New: push parse results back to the extension

Two complementary paths.

**Primary — WebSocket subscription** (already present in `app/src/lib/websocket/ws-server.ts`; see `stub-inventory.md:25` about the dead pong timeout). The extension opens a WebSocket when the side panel mounts. After `parseCachedPage` finishes, the app publishes a `ParseComplete` message on the captureId's channel. The side panel subscribes on capture submit and waits for the message.

**Fallback — polling**. If the WebSocket is down, the side panel polls `GET /api/extension/capture/:captureId/result` every 1 second for up to 10 seconds after submit. The endpoint returns `{ status: 'pending' | 'ready' | 'failed', parseResult?: ParseResultSummary }`.

Both paths surface the same `ParseResultSummary` payload (§4.1).

### 3.3 New: diff endpoint

`GET /api/extension/entity/:type/:id/diff?since=<captureId>` assembles a canonical projection of the entity at the time of `since`'s capture and the time of the latest capture, and diffs them.

The diff is **semantic**. A profile projection includes `{ full_name, headline, location, current_company, title, about, experience[], education[], skills[] }` — not one table row — so changes to work_history or education rows roll into the diff even though they live in separate tables.

### 3.4 New: unmatched-DOM report

The `ParseResult.unmatched` field (added by WS-1) flows in the `ParseResultSummary` payload. The side panel renders it as a collapsible list. Each item has a `[Report as regression]` button that POSTs to `/api/parser/regression-report` with:
- the capture ID,
- the unmatched block's DOM path and text preview,
- the raw HTML fragment (re-fetched from `page_cache` server-side, so the extension doesn't have to resend),
- a user-supplied free-text note (optional).

## 4. API contracts

### 4.1 `ParseResultSummary` shape

```typescript
interface ParseResultSummary {
  captureId: string;
  pageType: LinkedInPageType;
  entityType: 'contact' | 'company' | 'self' | null;
  entityId: string | null;
  parserVersion: string;
  parsedAt: string;                 // ISO 8601
  overallConfidence: number;        // 0.0 - 1.0
  fieldsExtracted: number;
  fieldsAttempted: number;
  fields: ParseFieldSummary[];
  unmatched: UnmatchedDomRegion[];  // may be empty
  upsertResult: {
    isNew: boolean;
    fieldsUpdated: string[];
  } | null;
}

interface ParseFieldSummary {
  field: string;
  present: boolean;
  value: string | number | string[] | null;  // short form; long values elided with "..."
  valueByteLength?: number;                   // for elided values
  confidence: number;
  source: 'selector' | 'heuristic' | 'content-heuristic' | 'title-tag' | 'url-slug' | 'fallback';
  selectorUsed: string;
  previousConfidence?: number;                // if same field was extracted on a prior capture of the same entity
}

interface UnmatchedDomRegion {
  domPath: string;                  // e.g. "main > section:nth-of-type(3) > div.ph5.pb5"
  textPreview: string;              // first 120 chars
  byteLength: number;
}
```

The key field for drift detection is `previousConfidence`: the sidebar can highlight any field whose confidence dropped significantly since the last capture of the same entity (the same mechanic that WS-1 §4.2 uses server-side, but per-entity instead of aggregate).

### 4.2 Diff endpoint response

```typescript
interface EntityDiffResponse {
  entityType: 'contact' | 'company';
  entityId: string;
  fromCaptureId: string;
  toCaptureId: string;
  fromCapturedAt: string;
  toCapturedAt: string;
  changes: EntityDiffChange[];
  unchangedFieldCount: number;
}

interface EntityDiffChange {
  field: string;                             // dotted path; e.g. "experience[0].title"
  kind: 'added' | 'removed' | 'changed';
  before: unknown;                           // null for 'added'
  after: unknown;                            // null for 'removed'
  confidenceBefore?: number;
  confidenceAfter?: number;
}
```

Projections (one per entity kind) are assembled server-side. A projection for `contact` looks like:

```typescript
interface ContactProjection {
  full_name: string | null;
  headline: string | null;
  location: string | null;
  current_company: string | null;
  title: string | null;
  about: string | null;
  experience: Array<{ company: string; title: string; duration: string | null; description: string | null; }>;
  education: Array<{ school: string; degree: string | null; fieldOfStudy: string | null; }>;
  skills: string[];
}
```

Why projections instead of row-level diffs: the relational model has separate tables for `work_history`, `education`, `skills` (referenced in `app/src/lib/parser/contact-upsert.ts`). A row-level diff would report "INSERT into work_history" and "UPDATE on contacts" — useless to the user. A projection-level diff says "title changed, experience[0] added".

Projection assembly is a new module `app/src/lib/projections/contact.ts` (+`company.ts`, +`self.ts`). Each is a pure function over DB rows, testable without a running DB if we fake the query layer.

### 4.3 Capture-result endpoint

```
GET /api/extension/capture/:captureId/result

200 → { status: 'ready', parseResult: ParseResultSummary }
200 → { status: 'pending' }
200 → { status: 'failed', error: string }
404 → { error: 'capture not found' }
```

Existing route scaffolding is under `app/src/app/api/extension/` — add this route there.

### 4.4 Regression-report endpoint

`POST /api/parser/regression-report`

```typescript
interface RegressionReportRequest {
  captureId: string;
  unmatched: UnmatchedDomRegion;
  userNote?: string;
}

interface RegressionReportResponse {
  reportId: string;
  fixtureSaved: boolean;          // we attempt to redact + save to a holding area
  issueUrl?: string;              // if GITHUB_REPORT_WEBHOOK_URL is configured
}
```

Server-side behavior:
1. Insert row into `parser_regression_reports`.
2. Fetch the full HTML from `page_cache` by `capture_id`.
3. Extract the unmatched sub-tree by `domPath`, redact PII, write to `data/parser-fixtures/_pending/` (gitignored — reviewer promotes to the tracked corpus).
4. If `GITHUB_REPORT_WEBHOOK_URL` env is set, POST an issue with title "Parser regression: <pageType>.<unmatched.domPath>" and body including the redacted fragment and the user's note.

## 5. Extension side — file map

```
browser/src/sidepanel/
  sidepanel.ts                (existing — 852 lines, will grow)
  panels/
    parse-result-panel.ts     (NEW)
    capture-diff-panel.ts     (NEW)
    unmatched-dom-panel.ts    (NEW)
  services/
    capture-result-service.ts (NEW — WS + polling)
    diff-service.ts           (NEW)
    regression-report-service.ts (NEW)
browser/src/shared/
  types/parse-result.ts       (NEW — mirrors server ParseResultSummary)
  types/diff.ts               (NEW)
```

The existing `sidepanel.ts` is big (852 lines) and does everything. We refactor by pulling each new panel into its own file, each exporting a `render(container: HTMLElement, state: SidePanelState)` and subscribing to `state-bus` events. Target Panel stays as-is for this sprint.

## 6. Extension side — interaction flow after a capture

```
 user clicks Capture
 └─ content script scrolls, observes DOM, builds payload (existing)
    └─ service worker POSTs /api/extension/capture (existing)
       └─ receives { captureId, queuedForParsing: true }
          └─ side panel opens a "Parsing…" state in the Parse Result panel
             ├─ opens WebSocket subscription for captureId (primary)
             └─ starts 1s polling (fallback)
                └─ one of them returns ParseResultSummary
                   └─ Parse Result panel renders fields
                      ├─ if previousConfidence known and delta < -0.2 → flag field
                      └─ compute and render Capture Diff panel
                         └─ GET /api/extension/entity/:type/:id/diff?since=<prev_capture_id>
                            └─ render changes
                   └─ render Unmatched DOM panel (collapsed if empty)
```

### 6.1 Previous-capture resolution

"Previous capture of the same entity" is tracked server-side by joining `page_cache` on `url` (normalized — strip query, lowercase, trailing slash). The extension sends only the URL; server returns the prior `captureId` alongside the parse result.

This does NOT require a new FK. The extension already normalizes URLs before capture (see `docs/content/docs/browser-extension/target-panel.mdx` discussion of URL matching).

## 7. Edge cases

- **First capture of an entity**: no prior `captureId`, so the Capture Diff panel renders "First capture — nothing to diff against" and is otherwise empty.
- **Capture of a page type for which parsing failed** (e.g. parser threw): `status: 'failed'`, sidebar renders the error + a "Retry parse" button that calls `POST /api/parser/reparse/:captureId`.
- **Unknown entity — parser succeeds but upsert skipped**: happens when parsed data lacks a matchable identifier. Parse Result panel shows fields but Capture Diff panel shows "Not linked to any target yet". A new "Link to target" button creates the entity on demand.
- **Capture on a page the user has not granted permission for** (post-WS-3 world): parse doesn't happen. Shows "Page not in permitted origin list" with a [Grant permission] button that invokes `chrome.permissions.request`.
- **Target changes mid-capture**: the user navigates away while a parse is still in flight. The panel listens for URL changes and, if the capture's entity no longer matches the current target, keeps rendering under a muted "From previous tab" header for 10 seconds, then dismisses.
- **Huge unmatched list**: cap at 10 regions per capture; a follow-up endpoint provides the full list. Most captures should emit zero or one.

## 8. Diff panel UX details

The capture-diff view is where drift becomes legible, so it is worth specifying the text rules:

- **Strings**: show "before → after" with the common prefix highlighted. Truncate either side to 60 chars.
- **Arrays**: compute LCS; show additions and removals, not reorderings. `["A","B","C"]` → `["A","C","D"]` renders `- B` and `+ D`, nothing else.
- **Object arrays** (experience, education): diff on an identity key (`company+title` for experience, `school` for education). A change within an object says "at experience[0]: title: 'Sr Eng' → 'VP Eng'".
- **Confidence drop only, no value change**: rendered in a muted tone, labeled "confidence dropped" — this is the canary for drift on a field whose value hasn't actually changed.
- **Ordering**: added > removed > changed, by field alpha within each kind.

## 9. Feed the loop — one-click regression report

The [Report as regression] button in the Unmatched DOM panel:

1. Opens a small modal asking "What do you think should have been extracted here?" (optional free text).
2. POSTs to `/api/parser/regression-report` with the capture ID and the region.
3. On success, toasts "Reported. Thanks." with a link to the GitHub issue if one was created.

The report is the end-to-end loop that turns a user's "this looks wrong" instinct into an actionable fixture sitting in `data/parser-fixtures/_pending/` waiting for a reviewer to approve it into the tracked corpus. Without this loop, the sprint is just telemetry. With this loop, the telemetry generates training data.

## 10. Relationship to WS-6 (Focus shifting)

The Parse Result, Capture Diff, and Unmatched DOM panels all scope naturally to the currently-locked target. If the target changes (task-lock fires, user pins a new entity, page-lock switches), the panels clear and re-render for the new target's latest capture (if any).

The existing Target Panel already handles target-change signaling via tab activation and URL-change events. This WS piggybacks on that — no new signals needed.

## 11. Telemetry the sidebar itself emits

Small thing, easy to forget: track sidebar interaction events so we can answer "is anyone using the diff panel" in a month. New analytics events:
- `sidepanel.parse_result.opened`
- `sidepanel.parse_result.field_expanded`
- `sidepanel.diff.opened`
- `sidepanel.unmatched.opened`
- `sidepanel.unmatched.reported` with `{ captureId, regionCount }`

Post to the existing `POST /api/extension/analytics` endpoint (mentioned in `browser/src/service-worker.ts`). Keep payloads minimal (no PII).

## 12. Implementation risks + mitigations

| Risk | Mitigation |
|------|-----------|
| WebSocket path is flaky or cold-start-slow | Always start both WS subscription and polling in parallel; whichever arrives first wins. Measure WS success rate in sidebar analytics — if below 80%, revisit. |
| Polling exhausts the 10s window on slow parses | Extend window for large page types (search can parse slowly). Configurable in extension settings. |
| Diff panel is too verbose for a frequent user | Every panel collapsible + persisted-collapsed state in `chrome.storage.local` per panel. |
| Regression report endpoint becomes a spam vector | Rate-limit: 20 reports per user per day, with per-URL dedup in a 24-hour window. |
| Unmatched-DOM list reveals HTML that embarrasses us | Cap text preview at 120 chars; no raw HTML in UI; link to full fragment only for logged-in admins. |
| Side panel freezes while computing diffs client-side | All diffing happens server-side (in the `/diff` endpoint). Client just renders. |

## 13. New code footprint

| File | LOC |
|------|-----|
| `app/src/app/api/extension/capture/[captureId]/result/route.ts` | 120 |
| `app/src/app/api/extension/entity/[type]/[id]/diff/route.ts` | 180 |
| `app/src/app/api/parser/regression-report/route.ts` | 140 (already counted in WS-1) |
| `app/src/app/api/parser/reparse/[captureId]/route.ts` | 60 |
| `app/src/lib/projections/contact.ts` | 130 |
| `app/src/lib/projections/company.ts` | 100 |
| `app/src/lib/projections/self.ts` | 80 |
| `app/src/lib/projections/diff.ts` | 150 |
| `app/src/lib/websocket/parse-events.ts` | 80 |
| `browser/src/sidepanel/panels/parse-result-panel.ts` | 220 |
| `browser/src/sidepanel/panels/capture-diff-panel.ts` | 180 |
| `browser/src/sidepanel/panels/unmatched-dom-panel.ts` | 140 |
| `browser/src/sidepanel/services/capture-result-service.ts` | 150 |
| `browser/src/sidepanel/services/diff-service.ts` | 80 |
| `browser/src/sidepanel/services/regression-report-service.ts` | 60 |
| Refactor of `sidepanel.ts` to mount new panels | 50 |

Total: ~1850 LOC excluding projection tests.

## 14. Acceptance checklist

- [x] After a capture, the Parse Result panel renders within 2 seconds. *Sidebar reads PARSE_COMPLETE WS push.*
- [x] The Capture Diff panel renders a semantic diff, not a row diff (projections module).
- [x] A confidence-only drop (same value, lower confidence) is visually distinct from a value change.
- [x] The Unmatched DOM panel surfaces at least one region when the parser is deliberately broken.
- [x] Regression reports land in `parser_selector_flags` (migration 039, renamed from `parser_regression_reports` during Phase 2 Track D implementation). *File drop under `data/parser-fixtures/_pending/` still pending.*
- [ ] Optional GitHub issue creation works when `GITHUB_REPORT_WEBHOOK_URL` is set. *Deferred to Phase 6.*
- [x] All three panels collapse/expand and persist their state across side-panel reopens.
- [x] No interaction with the main Next.js app pages (that's WS-6).
- [x] Analytics events fire for open / expand / report.
- [x] All three endpoints have integration tests covering the happy path + the four edge cases in §7.

## 15. Cross-references

- `01-parser-audit.md` §4.4 — `ParseResult.unmatched` is produced there.
- `04-targets-and-graph.md` — the target the sidebar is locked on.
- `07-architecture-and-schema.md` §3.4 — projection tables and the diff endpoint contract.
- `08-phased-delivery.md` — WS-2 begins the week WS-1 first publishes telemetry.
- `docs/content/docs/browser-extension/target-panel.mdx` — lock semantics unchanged.
- `stub-inventory.md:25` — the dead PONG_TIMEOUT_MS is in the WS path we are using; fix it as part of this work (P2 in the inventory).
