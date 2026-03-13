/**
 * Search-related types for the dashboard.
 *
 * Covers both semantic (vector) search via the RVF store and
 * text-based filtering over metadata fields.
 */

import type { RvfMetadata, ContactTier } from "./contact";

// ---------------------------------------------------------------------------
// Semantic search request — for k-NN queries against the vector store
// ---------------------------------------------------------------------------

export interface SemanticSearchRequest {
  /** Free-text query that will be embedded and searched */
  query: string;
  /** Maximum number of results to return (default: 20) */
  k?: number;
  /** Optional metadata filter to narrow results */
  filter?: SearchFilter;
}

// ---------------------------------------------------------------------------
// Metadata filter — applied during or after vector search
// ---------------------------------------------------------------------------

export interface SearchFilter {
  tier?: ContactTier | ContactTier[];
  cluster?: string | string[];
  persona?: string;
  behavioralPersona?: string;
  referralTier?: string;
  minGoldScore?: number;
  maxGoldScore?: number;
  enriched?: boolean;
  degree?: number;
}

// ---------------------------------------------------------------------------
// Search results
// ---------------------------------------------------------------------------

export interface SearchResult {
  id: string;
  score: number;
  metadata: RvfMetadata;
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
  total: number;
  executionTimeMs: number;
}

// ---------------------------------------------------------------------------
// Text filter — applied client-side or via API for table filtering
// ---------------------------------------------------------------------------

export interface TextFilter {
  field: keyof RvfMetadata;
  operator: "eq" | "neq" | "contains" | "gt" | "gte" | "lt" | "lte";
  value: string | number | boolean;
}

// ---------------------------------------------------------------------------
// Combined search + filter state — used by the search UI
// ---------------------------------------------------------------------------

export interface SearchState {
  query: string;
  filters: SearchFilter;
  page: number;
  pageSize: number;
  sortBy: string;
  sortDir: "asc" | "desc";
}
