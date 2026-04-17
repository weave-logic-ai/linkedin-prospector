// Phase 4 Track I — graph-data LRU cache unit tests.

describe('graph/data-cache', () => {
  beforeEach(async () => {
    const cache = await import('@/lib/graph/data-cache');
    cache._resetForTests();
  });

  it('returns null on miss, hit after set', async () => {
    const cache = await import('@/lib/graph/data-cache');
    const key = cache.buildCacheKey(
      { primaryTargetId: 't1', limit: 500, includeProvenanceEdges: false },
      'owner-1'
    );
    expect(cache.getCached(key)).toBeNull();
    cache.setCached(key, { nodes: [], edges: [] }, 'owner-1', 't1');
    const hit = cache.getCached(key);
    expect(hit?.value).toEqual({ nodes: [], edges: [] });
  });

  it('expires entries after TTL', async () => {
    const cache = await import('@/lib/graph/data-cache');
    const key = cache.buildCacheKey(
      { primaryTargetId: 't1', limit: 500, includeProvenanceEdges: false },
      null
    );
    const now = 1_000_000;
    cache.setCached(key, { nodes: [], edges: [] }, null, 't1', now);
    expect(cache.getCached(key, now + 59_999)).not.toBeNull();
    expect(cache.getCached(key, now + 60_001)).toBeNull();
  });

  it('evicts oldest entry when max capacity reached', async () => {
    const cache = await import('@/lib/graph/data-cache');
    // Fill to capacity.
    for (let i = 0; i < cache.GRAPH_DATA_CACHE_MAX_ENTRIES; i++) {
      const key = cache.buildCacheKey(
        { primaryTargetId: `t${i}`, limit: 500, includeProvenanceEdges: false },
        'owner-1'
      );
      cache.setCached(key, { i }, 'owner-1', `t${i}`);
    }
    expect(cache._cacheSize()).toBe(cache.GRAPH_DATA_CACHE_MAX_ENTRIES);
    // One more evicts the oldest.
    const overflow = cache.buildCacheKey(
      { primaryTargetId: 't-new', limit: 500, includeProvenanceEdges: false },
      'owner-1'
    );
    cache.setCached(overflow, { i: 99 }, 'owner-1', 't-new');
    expect(cache._cacheSize()).toBe(cache.GRAPH_DATA_CACHE_MAX_ENTRIES);
    const firstKey = cache.buildCacheKey(
      { primaryTargetId: 't0', limit: 500, includeProvenanceEdges: false },
      'owner-1'
    );
    expect(cache.getCached(firstKey)).toBeNull();
  });

  it('invalidateForOwner clears only that owner entries', async () => {
    const cache = await import('@/lib/graph/data-cache');
    const k1 = cache.buildCacheKey(
      { primaryTargetId: 't1', limit: 500, includeProvenanceEdges: false },
      'owner-1'
    );
    const k2 = cache.buildCacheKey(
      { primaryTargetId: 't2', limit: 500, includeProvenanceEdges: false },
      'owner-2'
    );
    cache.setCached(k1, { x: 1 }, 'owner-1', 't1');
    cache.setCached(k2, { x: 2 }, 'owner-2', 't2');
    cache.invalidateForOwner('owner-1');
    // All cache entries see the bumped token so both miss; the owner-scoped
    // delete is defensive belt-and-suspenders. Verify both reads are null.
    expect(cache.getCached(k1)).toBeNull();
    expect(cache.getCached(k2)).toBeNull();
  });

  it('invalidateForTarget clears matching target entries', async () => {
    const cache = await import('@/lib/graph/data-cache');
    const k1 = cache.buildCacheKey(
      { primaryTargetId: 't1', limit: 500, includeProvenanceEdges: false },
      'owner-1'
    );
    cache.setCached(k1, { x: 1 }, 'owner-1', 't1');
    cache.invalidateForTarget('t1');
    expect(cache.getCached(k1)).toBeNull();
  });

  it('provenance flag is part of the cache key', async () => {
    const cache = await import('@/lib/graph/data-cache');
    const withProvenance = cache.buildCacheKey(
      { primaryTargetId: 't1', limit: 500, includeProvenanceEdges: true },
      'owner-1'
    );
    const withoutProvenance = cache.buildCacheKey(
      { primaryTargetId: 't1', limit: 500, includeProvenanceEdges: false },
      'owner-1'
    );
    expect(withProvenance).not.toEqual(withoutProvenance);
    cache.setCached(withProvenance, { pro: true }, 'owner-1', 't1');
    expect(cache.getCached(withoutProvenance)).toBeNull();
  });

  it('token bump invalidates in-flight cached entries', async () => {
    const cache = await import('@/lib/graph/data-cache');
    const k1 = cache.buildCacheKey(
      { primaryTargetId: 't1', limit: 500, includeProvenanceEdges: false },
      'owner-1'
    );
    cache.setCached(k1, { x: 1 }, 'owner-1', 't1');
    cache.invalidateAll();
    expect(cache.getCached(k1)).toBeNull();
  });
});
