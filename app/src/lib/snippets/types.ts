// Snippet types — shared by API route, service, and tests.
//
// Per `.planning/research-tools-sprint/03-snippet-editor.md` §3, snippets are
// stored as causal_nodes rows with `entity_type='snippet'` and `kind='evidence'`.
// The sidecar tables `snippet_blobs` + `snippet_tags` exist only for image
// payloads (deferred to Phase 1.5) and the tag taxonomy. Tag application is
// denormalized into `causal_nodes.output.tags` (§6.2).

import type { SnippetTargetKind } from './chain';

/**
 * Request body for `POST /api/extension/snippet`. Text-only scope for
 * Phase 1 Track C — image / link / marquee defer to Phase 1.5.
 */
export interface SnippetSaveRequest {
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

export interface SnippetSaveResponse {
  snippetId: string;
  causalNodeId: string;
  chainId: string;
  /** Sequence of the appended chain entry; -1 if chain append failed. */
  chainSequence: number;
  /** Human-readable warnings (non-fatal). */
  warnings: string[];
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
  text: string;
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
