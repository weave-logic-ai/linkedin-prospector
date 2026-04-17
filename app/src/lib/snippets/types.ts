// Snippet types — shared by API route, service, and tests.
//
// Per `.planning/research-tools-sprint/03-snippet-editor.md` §3, snippets are
// stored as causal_nodes rows with `entity_type='snippet'` and `kind='evidence'`.
// The sidecar tables `snippet_blobs` + `snippet_tags` exist only for image
// payloads (deferred to Phase 1.5) and the tag taxonomy. Tag application is
// denormalized into `causal_nodes.output.tags` (§6.2).

import type { SnippetTargetKind } from './chain';

/**
 * Snippet content kind discriminator. Text landed in Phase 1 Track C;
 * image lands in Phase 1.5; link is deferred behind Phase 2 WS-5.
 */
export type SnippetKind = 'text' | 'image';

/**
 * Text-snippet request body. Historical shape — the route accepted a
 * bare-text payload before `kind` became a discriminator. When `kind` is
 * omitted it is treated as `'text'` for backward compatibility with the
 * shipped Phase 1 extension bundle.
 */
export interface SnippetSaveTextRequest {
  kind?: 'text';
  targetKind: SnippetTargetKind;
  targetId: string;
  text: string;
  sourceUrl: string;
  pageType?: string;
  tagSlugs?: string[];
  note?: string;
  mentionContactIds?: string[];
  /** Optional research_session id — populated when active, else ignored. */
  sessionId?: string;
}

/**
 * Image-snippet request body. Phase 1.5 scope per
 * `.planning/research-tools-sprint/08-phased-delivery.md` §3.4.
 *
 * `imageBytes` is base64-encoded (optionally prefixed with `data:<mime>;base64,`).
 * Size cap: 5 MB. Mime type: image/png, image/jpeg, image/webp.
 */
export interface SnippetSaveImageRequest {
  kind: 'image';
  targetKind: SnippetTargetKind;
  targetId: string;
  imageBytes: string;
  mimeType: string;
  width?: number;
  height?: number;
  sourceUrl: string;
  pageType?: string;
  tagSlugs?: string[];
  note?: string;
  sessionId?: string;
}

export type SnippetSaveRequest = SnippetSaveTextRequest | SnippetSaveImageRequest;

export interface SnippetSaveResponse {
  snippetId: string;
  causalNodeId: string;
  chainId: string;
  /** Sequence of the appended chain entry; -1 if chain append failed. */
  chainSequence: number;
  /** Human-readable warnings (non-fatal). */
  warnings: string[];
  /** For image snippets: the blob id referenced by the snippet node. */
  blobId?: string;
  /** For image snippets: whether the blob was deduped against an existing row. */
  blobReused?: boolean;
}

/**
 * Row shape surfaced by the snippets panel API. All fields derive from one
 * `causal_nodes` row plus its edges.
 */
export interface SnippetListItem {
  snippetId: string;
  causalNodeId: string;
  targetKind: SnippetTargetKind;
  targetId: string;
  kind: SnippetKind;
  text: string;
  /** Image-only: blob id for fetching bytes via GET /api/snippets/blob/:id. */
  blobId?: string | null;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  sourceUrl: string;
  pageType: string | null;
  tagSlugs: string[];
  note: string | null;
  mentionContactIds: string[];
  createdAt: string;
}

export interface SnippetTagRow {
  slug: string;
  label: string;
  parentSlug: string | null;
  isSeeded: boolean;
}
