// Phase 4 Track I — /api/graph/data LRU cache.
//
// Keyed on the composite of (primaryTargetId, filters_hash). The spec calls
// for 10 slots and a 60-second TTL; we implement a plain Map-based LRU to
// avoid adding a new runtime dependency. Entries are small JSON payloads
// (~tens-of-kB for a 6,000-contact graph) so a 10-entry ceiling is a few
// hundred kB of process memory.
//
// Invalidation is driven by two events:
//   1. research_target_state change  — `invalidateForOwner(ownerId)` is
//      called from the targets state endpoint whenever the state row is
//      updated. This clears all cached entries whose target id belongs to
//      that owner.
//   2. Lens activation — `invalidateForTarget(targetId)` is called from the
//      lens activation endpoint. Flipping the active lens changes the ICP
//      set used for scoring, which in turn changes the edge weights /
//      composite scores the graph renders.
//
// A cross-request invalidation token is exposed via `getInvalidationToken()`
// so the route handler can stamp each cache entry and discard stale entries
// if a bulk invalidation fires between cache-check and cache-return.
//
// All state is process-local. Cluster deployments will see per-pod cache
// variance but that is fine — the cache is a latency optimization, not a
// consistency layer.

export interface GraphDataCacheKey {
  primaryTargetId: string | null;
  limit: number;
  includeProvenanceEdges: boolean;
}

export interface GraphDataCacheEntry<T = unknown> {
  value: T;
  /** UNIX ms at which this entry becomes stale. */
  expiresAt: number;
  /** Token captured when the entry was written; discarded on mismatch. */
  token: number;
  /** The owner id this entry was scoped to, for invalidate-by-owner. */
  ownerId: string | null;
  /** The primary target id this entry was scoped to. */
  primaryTargetId: string | null;
}

const TTL_MS = 60_000; // 60 seconds (per spec)
const MAX_ENTRIES = 10;

const cache = new Map<string, GraphDataCacheEntry>();
let invalidationToken = 0;

export function buildCacheKey(
  key: GraphDataCacheKey,
  ownerId: string | null
): string {
  // Stable serialization. Ordering matters because Map lookup uses === on
  // the string; field order must be fixed.
  return JSON.stringify([
    ownerId ?? '',
    key.primaryTargetId ?? '',
    key.limit,
    key.includeProvenanceEdges ? 1 : 0,
  ]);
}

export function getCached<T>(
  key: string,
  now: number = Date.now()
): GraphDataCacheEntry<T> | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    cache.delete(key);
    return null;
  }
  if (entry.token !== invalidationToken) {
    cache.delete(key);
    return null;
  }
  // LRU touch: re-insert to move to end.
  cache.delete(key);
  cache.set(key, entry);
  return entry as GraphDataCacheEntry<T>;
}

export function setCached<T>(
  key: string,
  value: T,
  ownerId: string | null,
  primaryTargetId: string | null,
  now: number = Date.now()
): void {
  // Evict oldest while at or above cap. Map preserves insertion order so the
  // first key in `.keys()` is the least-recently-set/accessed.
  while (cache.size >= MAX_ENTRIES) {
    const firstKey = cache.keys().next().value;
    if (firstKey === undefined) break;
    cache.delete(firstKey);
  }
  cache.set(key, {
    value,
    expiresAt: now + TTL_MS,
    token: invalidationToken,
    ownerId,
    primaryTargetId,
  });
}

/**
 * Bump the invalidation token. Existing cache entries become unreachable on
 * their next `getCached` call without a traversal. The entries will be
 * evicted lazily via the token check or eagerly when the LRU rolls them out.
 */
export function invalidateAll(): void {
  invalidationToken += 1;
  cache.clear();
}

/**
 * Clear every entry written for the given owner. Used when the owner's
 * target state row changes (primary/secondary swap, etc.).
 */
export function invalidateForOwner(ownerId: string): void {
  invalidationToken += 1;
  for (const [k, v] of cache) {
    if (v.ownerId === ownerId) {
      cache.delete(k);
    }
  }
}

/**
 * Clear every entry whose cached root target matches the given id. Used
 * when a lens is activated for that target (which changes the ICP plumbing
 * that the graph-data endpoint projects into its response).
 */
export function invalidateForTarget(targetId: string): void {
  invalidationToken += 1;
  for (const [k, v] of cache) {
    if (v.primaryTargetId === targetId) {
      cache.delete(k);
    }
  }
}

export function getInvalidationToken(): number {
  return invalidationToken;
}

/** Test-only: reset both the LRU contents and the token counter. */
export function _resetForTests(): void {
  cache.clear();
  invalidationToken = 0;
}

/** Test-only: observable size. */
export function _cacheSize(): number {
  return cache.size;
}

export const GRAPH_DATA_CACHE_TTL_MS = TTL_MS;
export const GRAPH_DATA_CACHE_MAX_ENTRIES = MAX_ENTRIES;
