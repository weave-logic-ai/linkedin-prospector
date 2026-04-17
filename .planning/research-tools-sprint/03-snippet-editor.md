# WS-3 — Snippet Editor

**Scope**: Let the user capture arbitrary multi-modal fragments (text, image region, link) from any URL they have permission for, tag them with structured metadata, optionally link people / companies mentioned inside, and route them into `causal_nodes` as first-class evidence on the current target.
**Non-scope**: OCR of image snippets (future). Full-page archival of non-LinkedIn pages (that is source-expansion, WS-5). LLM-authored tagging (future).
**Supersedes**: `docs/plans/browser-snippet-expansion.md` — that document remains as input reference and is not deleted. This doc is the authoritative plan.
**Depends on**: WS-4 (target model — a snippet must attach to a target), WS-7 (schema — `causal_nodes.kind='evidence'` semantics), ECC `exo_chain_entries` from `026-ecc-exo-chain.sql` for tamper-evident provenance.

---

## 1. Context and intent

The user described a research workflow that is explicitly about evidence outside LinkedIn: Wayback snapshots, press releases, SEC filings, podcast transcripts. The intent of a snippet is not a note — it is evidence. Evidence has provenance (where it came from, when, what URL, what hash) and it has structure (what type of fact is this, which entities does it concern, what date does the evidence itself refer to rather than when it was captured).

The existing `docs/plans/browser-snippet-expansion.md` laid out the open questions — this doc commits to specific answers for each.

### 1.1 Open questions the old plan deferred, answered here

| Old question | This doc's answer | Cite |
|--------------|-------------------|------|
| Multi-modal: inline vs object storage? | Inline for text snippets; hash-only for image crops with blob in a new `snippet_blobs` table; links stored as resolved `source_records` rows. | §4 |
| Tag taxonomy? | Seeded closed vocabulary of 18 tags under 4 hierarchies, user-extensible. | §6 |
| Entity resolution in snippet text? | Client-side highlight, server-side resolve via existing contact/company lookup endpoints + a create-on-confirm flow. | §5 |
| Storage target? | `causal_nodes` with `entity_type='snippet'` and `kind='evidence'`. No separate snippets table. | §3, WS-6 |
| `<all_urls>` permissions? | Opt-in per origin via `chrome.permissions.request`. "Snip mode" toggle in popup gates the selection UI. | §7 |
| Selection UX? | Hotkey (default Ctrl+Shift+S) + context menu + drag-marquee for images. Floating widget minimized by default. | §2 |

## 2. User-facing surfaces

Three surfaces, in one lightweight content script injected only on permitted origins.

### 2.1 Floating widget

A 32×32 pill on the bottom-right of any permitted page. Shows the current target's name and a "•" badge when a selection is active. Collapsed by default, expands to a 360×180 card with:

- Selection preview (text or image thumbnail).
- Source URL (read-only).
- Tags field (with autocomplete from §6).
- Referenced-date picker ("the evidence is about what date?" — distinct from captured_at).
- Linked-entities row (see §5).
- [Save to target] button — saves to the currently-locked target from the side panel.

### 2.2 Context menu

Chrome's `contextMenus` API adds two items on permitted origins:

- "Snip selection to <target name>" — grabs current text selection, opens the widget prefilled.
- "Snip image" — when right-clicking an image, captures its src + alt + a pixel-level crop if the user drew one.

### 2.3 Hotkey

`Ctrl+Shift+S` / `Cmd+Shift+S` toggles a drag-marquee mode. Any element or region the user drags becomes a snippet candidate: text inside the rectangle + any images wholly contained.

The hotkey is customizable via `chrome.commands.update`, configured in the popup under a new "Snippet" tab.

## 3. Data model — snippets as causal nodes

Not a new table. A snippet is one `causal_nodes` row with:

```
entity_type = 'snippet'
entity_id   = <uuid — internal snippet id>
operation   = 'captured'
inputs      = {
                source_url: string,
                source_record_id: uuid | null,      -- if URL resolved to a source_records row
                captured_at: iso8601,
                tenant_id: uuid,
                page_title: string,
                viewport: { w, h },
                selection_mode: 'text' | 'image' | 'marquee' | 'link',
              }
output      = {
                content: { kind, text?, blob_id?, url?, href? },
                referenced_date: iso8601 | null,
                tags: string[],
                snippet_hash: bytea,                -- BLAKE3 of canonical JSON
              }
session_id  = <research_session id if active>
```

Additional `causal_edges` rows link the snippet to:
- the primary target (`relation='evidence_for'`)
- each linked entity mentioned inside (`relation='mentions'`)
- the source record (`relation='cited_from'`) if resolvable to a `source_records` row

An `exo_chain_entries` row is appended on save with BLAKE3 hashing of `{snippet.content, source_url, captured_at}` — providing tamper-evident provenance per the existing ExoChain pattern (see `026-ecc-exo-chain.sql`, `docs/development_notes/ecc/runtime-verification.md` step 7). This answers "is this evidence still what it was when we captured it" for any auditor.

### 3.1 Image blobs

Images don't live in `causal_nodes.output`. They live in:

```
CREATE TABLE snippet_blobs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  mime_type    TEXT NOT NULL,
  byte_length  INTEGER NOT NULL,
  sha256       BYTEA NOT NULL,
  data         BYTEA NOT NULL,                    -- inline for now; migrate to object storage later
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX ix_snippet_blobs_sha ON snippet_blobs(tenant_id, sha256);
```

Dedup on `sha256` — the same logo crop twice is one blob row. Size cap: 1 MB per blob, server-enforced. Total-per-tenant quota lives in `budgets` (existing table, see `012-budget-schema.sql`).

The `causal_nodes.output.content.blob_id` field references the `snippet_blobs.id` when `kind='image'`.

### 3.2 Links and referenced pages

If the user snips a link (e.g. they right-click a link and "Snip link"), the target URL gets fetched server-side (respecting robots.txt; see WS-5 §3) and stored as a `source_records` row. The `causal_nodes.inputs.source_record_id` references the row, and the snippet `content.kind='link'` with `href` set.

## 4. Multi-modal storage decision matrix

| Content kind | Stored where | Rationale |
|--------------|-------------|-----------|
| Text selection | `causal_nodes.output.content.text` (inline) | Small, searchable, no blob lookup needed. |
| Image crop | `snippet_blobs.data` + `causal_nodes.output.content.blob_id` | Binary, dedupable, size-capped. |
| Link only | `source_records` row (fetched server-side) + `causal_nodes.inputs.source_record_id` | Links are evidence of a relationship between the current page and the linked-to page; both matter. |
| Marquee (text + images in a region) | One snippet `causal_node` per kind, stitched with `causal_edges` `relation='sibling_of'` | Lets queries fan out or roll up. |

## 5. Entity resolution inside snippets

When the user selects text, the client script runs a cheap local regex pass for likely entity mentions:

- Proper-noun bigrams matching `/^[A-Z][a-z]+ [A-Z][a-z]+$/` → possible person names.
- `@(\w+)` or capitalized followed by "Inc"/"LLC"/"Ltd"/"Corp" → possible company.
- URL patterns `linkedin.com/in/...` or `linkedin.com/company/...` → resolvable via the existing extension lookup endpoints.

Each candidate is rendered with an underline in the widget preview. Clicking it opens a suggestion dropdown:

- "Link to Jane Doe (existing contact)" — populated via `GET /api/extension/contact/search?q=jane+doe`.
- "Link to Acme Inc (existing company)" — via `GET /api/extension/company/search?q=acme`.
- "Create contact 'Jane Doe'" — opens a slim form, creates via a new `POST /api/contacts` endpoint.
- "Dismiss" — stops treating this as a mention.

Confirmed links become `causal_edges` with `relation='mentions'`. Dismissed candidates are not stored (don't persist non-facts).

### 5.1 Dedup and match confidence

Search endpoints already exist for contact/company matching. They should return a confidence score per match (exact name, fuzzy name, LinkedIn URL match) so the UI can default to the best candidate but let the user override.

Name matching tolerates:
- Case and punctuation differences.
- Middle initials.
- Common western name-order variations (`First Last` vs `Last, First`).
- Nothing else — we do not fuzzy-match surnames across diacritics without a user confirm.

## 6. Tag taxonomy

A closed-vocabulary seed with four hierarchies. Users can add tags; new tags are lower-cased and namespaced under `user/`.

### 6.1 Seeded tags

```
role-history/
  role-history/current
  role-history/prior
  role-history/departure
  role-history/promotion

achievement/
  achievement/award
  achievement/press
  achievement/funding

filing/
  filing/sec-10k
  filing/sec-10q
  filing/sec-8k
  filing/sec-13f
  filing/sec-proxy
  filing/court
  filing/patent

news/
  news/press-release
  news/article
  news/blog
  news/podcast
  news/interview

provenance/
  provenance/wayback
  provenance/screenshot
  provenance/user-note
```

### 6.2 Storage

```
CREATE TABLE snippet_tags (
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  slug        TEXT NOT NULL,                        -- e.g. "filing/sec-10k"
  label       TEXT NOT NULL,                        -- human-readable
  parent_slug TEXT,                                 -- null for roots
  is_seeded   BOOLEAN NOT NULL DEFAULT false,
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, slug)
);
```

Tag application is stored as an array inside `causal_nodes.output.tags`. This is denormalized on purpose — tags are rarely queried by tag alone and the fan-out from a join-table would cost more than it saves.

For the infrequent "find all snippets tagged `filing/*` on this target" query, a GIN index on the JSONB path handles it:

```sql
CREATE INDEX ix_causal_nodes_snippet_tags
  ON causal_nodes USING GIN ((output -> 'tags'))
  WHERE entity_type = 'snippet';
```

### 6.3 User extension

A new tag typed by the user is accepted after (a) it doesn't collide with a seeded slug, (b) it has a non-empty parent from the seeded set, and (c) it is length 2-40 chars / matches `^[a-z0-9][a-z0-9-/]*$`. Otherwise rejected in the UI.

## 7. Permission model — `<all_urls>` without the user flinching

### 7.1 Constraint

Expanding `host_permissions` to `<all_urls>` is a step-change in what the extension claims to do. Chrome and users read that as "this extension can read every page." That is technically what we need (because a user might want to snip from anywhere), but it is unnecessary on 99% of pages the user visits.

### 7.2 Solution — on-demand per-origin permission

Use `optional_host_permissions: ["<all_urls>"]` in the manifest (`browser/src/manifest.json`). The base permission stays LinkedIn-only. When the user tries to snip on a new origin, the content script detects the missing permission and the side panel (already injected everywhere) shows:

```
  Snippet mode is off on this site.
  [Turn on for this site]
```

Clicking calls `chrome.permissions.request({ origins: ["https://edgar.sec.gov/*"] })`. Chrome's native prompt fires. If granted, the content script injects on subsequent loads of that origin.

### 7.3 "Snip mode" toggle

Even when permissions are granted, the snippet widget stays minimized. The user explicitly toggles "Snip mode" from the popup (or the hotkey) to activate the selection UX. This keeps normal browsing un-intrusive.

### 7.4 Permission hygiene

- A settings tab lists every granted origin with a "Revoke" button. Revoke calls `chrome.permissions.remove`.
- Every granted origin is stored in `chrome.storage.sync` for cross-device visibility but the actual permission remains a Chrome-native concept.
- The app server never sees the permission state — it only sees inbound snippet POSTs that happen to originate from some URL.

## 8. API contracts

### 8.1 Save a snippet

`POST /api/extension/snippet`

```typescript
interface SnippetSaveRequest {
  targetId: string;                    // research_targets.id (from WS-4)
  content:
    | { kind: 'text';  text: string; sourceUrl: string; domPath?: string; }
    | { kind: 'image'; blobBase64: string; mimeType: string; sourceUrl: string; altText?: string; crop?: { x:number; y:number; w:number; h:number; }; }
    | { kind: 'link';  href: string; sourceUrl: string; }
    | { kind: 'marquee'; parts: Array<SnippetSaveRequest['content']>; };
  referencedDate: string | null;       // iso8601
  tags: string[];
  linkedEntities: Array<{
    kind: 'contact' | 'company';
    mode: 'link-existing' | 'create-new';
    id?: string;                       // if link-existing
    draft?: {                          // if create-new
      name: string;
      linkedinUrl?: string;
    };
  }>;
  userNote?: string;
  pageTitle: string;
  viewport: { w: number; h: number };
  capturedAt: string;                  // iso8601, client time; server verifies within ±5 min
  sessionId?: string;                  // if an active research session
}

interface SnippetSaveResponse {
  snippetId: string;                   // causal_nodes.entity_id
  causalNodeId: string;                // causal_nodes.id
  exoChainEntryId: string;
  createdEntities: Array<{ kind: 'contact' | 'company'; id: string; name: string; }>;
  warnings: string[];
}
```

Server-side flow:
1. Authenticate extension token.
2. Resolve target. 404 if target not owned by requester's tenant.
3. Validate tags against `snippet_tags`. Unknown tags are rejected unless the request includes `allowNewTags: true`.
4. Resolve / create each linked entity.
5. If content.kind = 'image', upload blob, dedup, get `blob_id`.
6. If content.kind = 'link', enqueue source-record fetch (WS-5), get `source_record_id` or null if async.
7. Create `causal_nodes` row with the structure from §3.
8. Create `causal_edges`: one `evidence_for` to target, one `mentions` per linked entity, optional `cited_from` if source record resolved.
9. Append `exo_chain_entries` row with BLAKE3 hash.
10. Return response.

Wrapped in a DB transaction. On any failure, rollback everything except blob upload (which is already idempotent by hash).

### 8.2 List snippets for a target

`GET /api/targets/:id/snippets?tag=filing&kind=text&limit=50`

Returns a paged list of snippet summaries ordered by `referenced_date DESC NULLS LAST, captured_at DESC`.

### 8.3 Retrieve a snippet

`GET /api/snippets/:id` returns the full node + its edges and any blobs via signed short-lived URLs.

### 8.4 Entity resolution helpers

`GET /api/extension/contact/search?q=<free text>&limit=10`
`GET /api/extension/company/search?q=<free text>&limit=10`

Both return `{ matches: Array<{ id, name, confidence, metadata }> }`. Existing `app/src/app/api/extension/contact/[...url]/route.ts` already does URL matching; these search endpoints are new.

### 8.5 Reparse a link snippet

When a link snippet's source_record resolves async (after WS-5 fetches the URL), a server-side job publishes a WebSocket message to the extension subscribed to that snippet's session, so the widget can update.

## 9. Content script architecture

New files under `browser/src/content-snippet/` — kept separate from `browser/src/content/index.ts` (which is LinkedIn-specific). Loaded conditionally based on origin permission.

```
browser/src/content-snippet/
  index.ts                  — entrypoint; installs widget, listens to messages
  selection/
    text-selection.ts       — Range → serializable snippet
    image-selection.ts      — <img> context-menu handler
    marquee-selection.ts    — drag rectangle + hit test
  widget/
    floating-widget.ts      — 32×32 pill + expanded card
    entity-highlighter.ts   — regex → underlined spans → popover
    tag-autocomplete.ts     — fetches snippet_tags via background
  communication/
    background-bridge.ts    — sendMessage wrappers
browser/src/service-worker.ts — add SNIPPET_SAVE, PERMISSION_REQUEST handlers
browser/src/popup/
  snippet-settings.ts       — origin-permission listing + snip-mode toggle
browser/src/manifest.json
  host_permissions: [ "*://*.linkedin.com/*" ]
  optional_host_permissions: [ "<all_urls>" ]
  permissions: [ ..., "contextMenus" ]
  commands: { "toggle-snip-mode": { suggested_key: { default: "Ctrl+Shift+S" } } }
```

## 10. Security + trust

- **Permissions**: never request `<all_urls>` at install; always opt-in per origin (§7).
- **Blob size cap**: 1 MB per blob; reject with a clear error server-side. Cap total blob bytes per tenant per day.
- **PII on snippet text**: server-side run the existing PII scrubber (`aidefence_has_pii` pattern) and mark the snippet with a `pii_detected` flag in `causal_nodes.output.meta`. Do not modify the text — the user chose what to snip. Mark it so downstream features (sharing, export) can honor the flag.
- **Origin spoofing**: content script passes `window.location.href`. We verify server-side that the URL's origin is in the user's granted-origin list (stored in `chrome.storage.sync` and mirrored to an extension-session row). Mismatch → reject.
- **XSS in rendered snippet text**: when rendering snippet text in the main app, always use `textContent` / safe DOM insertion — never `innerHTML`. The linter can enforce this (`no-unsafe-innerhtml`).
- **Screenshot vs image snip**: a screenshot of a whole page is indistinguishable from a crop; both go through the same pipeline. We don't add screenshot-specific handling this sprint — users who want a screenshot can marquee the whole viewport.

## 11. Failure modes + recovery

| Failure | Recovery |
|---------|----------|
| Extension offline when user snips | Queue in IndexedDB (already used by offline capture queue per `capturing-pages.mdx`). Replay on reconnect. |
| Permission revoked mid-session | Widget shows "permission required" state; save button disabled. |
| Target was deleted before save | Server returns 404; client shows toast and offers to re-pick a target. |
| Image blob over size | Client-side validation rejects before POST with a clear error. |
| Linked entity lookup fails | Save succeeds without the link; warning returned; user can re-link later from the main app. |
| DB transaction fails partway | Rolled back; snippet is not saved; blob upload remains (idempotent by hash — no orphan cleanup needed because blob rows are not referenced without a snippet row). |

## 12. Interaction with research sessions

If an active research session exists (see `028-ecc-cognitive-tick.sql`), `causal_nodes.session_id` is populated when a snippet is saved. Later, a session replay lists all snippets captured during the session, ordered by `captured_at`. This is the thread the user walks back down the next day.

## 13. UX details worth specifying

- **Preview**: the widget shows the first 200 chars of text or a 120-px-wide thumbnail for images. Full preview on hover-expand.
- **Tag suggestions**: contextual — if `source_url` matches `*.sec.gov/*` default to `filing/sec-*`; `web.archive.org/*` defaults to `provenance/wayback`.
- **Referenced date**: defaults from source heuristics — EDGAR URL contains the filing date; news article `<meta property="article:published_time">` when present; Wayback timestamp in the URL.
- **Linked entity creation**: we don't want full contact-form UX in a sidebar widget. The "create new" path captures only name + optional LinkedIn URL. Everything else is lazily filled on a later capture of the new contact's LinkedIn page. Document this trade-off in the UI copy ("We'll fill in the rest when you capture their LinkedIn profile.").
- **Save confirmation**: toast with "Snip saved · 3 tags · linked to Jane Doe" and a link to the snippet's page in the main app.

## 14. Main-app rendering of snippets (cross-ref with WS-6)

This sprint adds the Snippets panel to the contact/company detail page in the Next.js app. Minimal surface:

- `app/src/components/target/snippets-panel.tsx` — infinite-scroll list, filters by tag, kind, date.
- `app/src/app/(app)/snippets/[id]/page.tsx` — single-snippet view with full content, blob, linked entities, provenance (ExoChain verification status, source record link).

The UI is additive — a new panel in the existing target detail page. No existing component is reorganized.

## 15. New code footprint

| File / area | LOC |
|-------------|-----|
| `browser/src/content-snippet/` (all) | ~1100 |
| `browser/src/popup/snippet-settings.ts` | 180 |
| `browser/src/service-worker.ts` additions | 150 |
| `browser/src/manifest.json` changes | 15 |
| `app/src/app/api/extension/snippet/route.ts` | 280 |
| `app/src/app/api/targets/[id]/snippets/route.ts` | 120 |
| `app/src/app/api/snippets/[id]/route.ts` | 100 |
| `app/src/app/api/extension/{contact,company}/search/route.ts` | 140 |
| `app/src/lib/snippets/service.ts` | 260 |
| `app/src/lib/snippets/entity-resolver.ts` | 180 |
| `app/src/lib/snippets/blob-store.ts` | 120 |
| `app/src/lib/snippets/validation.ts` | 140 |
| `app/src/lib/snippets/hash.ts` | 60 |
| `app/src/components/target/snippets-panel.tsx` | 230 |
| `app/src/app/(app)/snippets/[id]/page.tsx` | 200 |
| `data/db/init/034-snippets-schema.sql` | 120 |
| Tests | ~600 |

Total: ~4000 LOC.

## 16. Acceptance checklist

- [ ] Text snippet round-trip: select → widget opens prefilled → save → appears in contact's Snippets panel with the selected tags.
- [ ] Image snippet round-trip: right-click image → save → blob stored, thumbnail renders on target.
- [ ] Link snippet round-trip: right-click link → save → source_records row created (may be async), snippet references it.
- [ ] Marquee selection captures a text + image region in one snippet.
- [ ] Entity resolution inside text: proper-noun underline fires, dropdown resolves to existing contact or creates new.
- [ ] Tag auto-suggestion defaults correctly for EDGAR and Wayback URLs.
- [ ] Permission on a new origin prompts Chrome's native permission dialog and persists.
- [ ] Revoking an origin removes it from the settings list and prevents snipping on that domain.
- [ ] Snippet saves as `causal_nodes` row with `entity_type='snippet'` and correct edges.
- [ ] ExoChain entry is appended and passes `verifyChainHashes`.
- [ ] PII scrubber flag is set when applicable.
- [ ] Offline save queues and replays.
- [ ] GIN index on `output->tags` is present and used (check with `EXPLAIN`).

## 17. Cross-references

- `docs/plans/browser-snippet-expansion.md` — input, not output. Kept for history.
- `04-targets-and-graph.md` — source of the target concept a snippet attaches to.
- `05-source-expansion.md` §3 — source_records table that link snippets reference.
- `06-evidence-and-provenance.md` — how snippets flow into ECC and become auditable.
- `07-architecture-and-schema.md` §3.2 — `snippet_blobs`, `snippet_tags`, index choices.
- `026-ecc-exo-chain.sql` — ExoChain semantics we lean on for provenance.
- `docs/development_notes/ecc/runtime-verification.md` — verification runbook for ECC; snippet ExoChain entries must appear in the same table.
