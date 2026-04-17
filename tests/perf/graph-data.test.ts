// Phase 4 Track I perf harness — /api/graph/data re-rooting latency.
//
// We do not run this against a real Postgres (CI has no database). Instead
// we seed a mocked pg client with a 6,000-contact corpus and assert:
//
//   1. The cold (cache miss) p95 stays under the 200 ms spec budget at this
//      corpus size when the SQL-layer latency is simulated at a realistic
//      4–8 ms per round-trip (three round-trips: nodes, edges, missing
//      sources).
//   2. The warm (cache hit) p50/p95/p99 stay under 50 ms — the explicit
//      cache-hit budget in the task description.
//   3. The SQL the route emits references `source_contact_id` /
//      `target_contact_id` — a text-level proxy for "uses
//      idx_edges_source_contact_id / idx_edges_target_contact_id". A real
//      EXPLAIN assertion would require a live DB; this keeps the harness
//      runnable under `npm test`.
//
// Numbers are logged to console.log so the PR author can paste p50/p95/p99
// into the PR body per the sprint spec.

jest.mock('@/lib/db/client', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  healthCheck: jest.fn(),
  getPool: jest.fn(),
  shutdown: jest.fn(),
}));
jest.mock('@/lib/targets/service', () => ({
  getCurrentOwnerProfileId: jest.fn(async () => 'owner-1'),
  getTargetById: jest.fn(async (id: string) => ({
    id,
    tenantId: 'tenant',
    kind: 'contact',
    ownerId: null,
    contactId: 'contact-1',
    companyId: null,
    label: 'Contact 1',
    pinned: false,
    createdAt: '',
    updatedAt: '',
    lastUsedAt: '',
  })),
  getTargetEntityId: jest.fn((t: { contactId: string }) => t.contactId),
}));

interface MockContact {
  id: string;
  full_name: string;
  current_company: string | null;
  title: string | null;
  tier: string | null;
  composite_score: number | null;
}

function seedContacts(count: number): MockContact[] {
  const rows: MockContact[] = [];
  for (let i = 0; i < count; i++) {
    rows.push({
      id: `contact-${i}`,
      full_name: `Contact ${i}`,
      current_company: i % 7 === 0 ? `Acme ${i % 13}` : null,
      title: i % 5 === 0 ? 'Engineer' : 'Manager',
      tier: i % 4 === 0 ? 'gold' : 'silver',
      composite_score: Math.random(),
    });
  }
  return rows;
}

function seedEdges(contactCount: number, avgDegree: number) {
  const edges: Array<{
    id: string;
    source_contact_id: string;
    target_contact_id: string;
    edge_type: string;
    weight: number;
  }> = [];
  let eid = 0;
  for (let i = 0; i < contactCount; i++) {
    const degree = Math.max(1, Math.round(avgDegree * (0.5 + Math.random())));
    for (let d = 0; d < degree; d++) {
      const j = (i + 1 + d) % contactCount;
      edges.push({
        id: `edge-${eid++}`,
        source_contact_id: `contact-${i}`,
        target_contact_id: `contact-${j}`,
        edge_type: 'CONNECTED_TO',
        weight: 1,
      });
    }
  }
  return edges;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

describe('/api/graph/data perf', () => {
  let rowsCache: {
    contacts: MockContact[];
    edges: ReturnType<typeof seedEdges>;
  };

  beforeAll(() => {
    rowsCache = {
      contacts: seedContacts(6000),
      edges: seedEdges(6000, 3), // ~18,000 edges
    };
  });

  beforeEach(async () => {
    const cache = await import('@/lib/graph/data-cache');
    cache._resetForTests();
    const { query } = await import('@/lib/db/client');
    const mockQuery = query as jest.MockedFunction<typeof query>;
    mockQuery.mockReset();
    // Simulate realistic per-query latency. Three db round-trips per cold
    // request: (1) nodes CTE, (2) edges IN-list, (3) missing-sources fill.
    const simulateLatencyMs = 6;
    mockQuery.mockImplementation(async (sql: unknown) => {
      const text = String(sql);
      await new Promise((r) => setTimeout(r, simulateLatencyMs));
      if (text.includes('FROM edges') && text.includes('WHERE e.target_contact_id')) {
        return {
          rows: rowsCache.edges.slice(0, 300),
          command: '',
          rowCount: 300,
          oid: 0,
          fields: [],
        } as unknown as ReturnType<typeof query>;
      }
      if (text.includes('WHERE c.id = ANY($1)')) {
        // missing-sources path
        return {
          rows: [],
          command: '',
          rowCount: 0,
          oid: 0,
          fields: [],
        } as unknown as ReturnType<typeof query>;
      }
      // nodes path (both neighborhood and top-by-score) — return a subset
      // equal to the requested limit.
      return {
        rows: rowsCache.contacts.slice(0, 500),
        command: '',
        rowCount: 500,
        oid: 0,
        fields: [],
      } as unknown as ReturnType<typeof query>;
    });
  });

  it('cold-path p95 stays under the 200ms spec budget', async () => {
    const { GET } = await import('@/app/api/graph/data/route');
    const samples: number[] = [];

    for (let i = 0; i < 20; i++) {
      // Vary primaryTargetId so each call is a cache miss.
      const url = new URL(`http://x/api/graph/data?primaryTargetId=tgt-${i}`);
      const req = new Request(url, { method: 'GET' });
      const start = Date.now();
      const res = await GET(req as unknown as import('next/server').NextRequest);
      const elapsed = Date.now() - start;
      expect(res.status).toBe(200);
      samples.push(elapsed);
    }

    const p50 = percentile(samples, 50);
    const p95 = percentile(samples, 95);
    const p99 = percentile(samples, 99);
    // eslint-disable-next-line no-console
    console.log(
      `[perf] /api/graph/data cold  p50=${p50}ms p95=${p95}ms p99=${p99}ms (n=${samples.length}, 6000 contacts)`
    );

    expect(p95).toBeLessThan(200);
    expect(p99).toBeLessThan(250);
  });

  it('warm-path (cache hit) stays under 50ms on average', async () => {
    const { GET } = await import('@/app/api/graph/data/route');

    // Prime the cache on one target id.
    const priming = new Request('http://x/api/graph/data?primaryTargetId=tgt-warm', {
      method: 'GET',
    });
    const primeRes = await GET(priming as unknown as import('next/server').NextRequest);
    expect(primeRes.status).toBe(200);
    expect(primeRes.headers.get('x-graph-data-cache')).toBe('miss');

    const samples: number[] = [];
    for (let i = 0; i < 30; i++) {
      const url = new URL('http://x/api/graph/data?primaryTargetId=tgt-warm');
      const req = new Request(url, { method: 'GET' });
      const start = Date.now();
      const res = await GET(req as unknown as import('next/server').NextRequest);
      const elapsed = Date.now() - start;
      expect(res.status).toBe(200);
      expect(res.headers.get('x-graph-data-cache')).toBe('hit');
      samples.push(elapsed);
    }

    const p50 = percentile(samples, 50);
    const p95 = percentile(samples, 95);
    const p99 = percentile(samples, 99);
    // eslint-disable-next-line no-console
    console.log(
      `[perf] /api/graph/data warm  p50=${p50}ms p95=${p95}ms p99=${p99}ms (n=${samples.length}, cache hit)`
    );

    expect(p95).toBeLessThan(50);
  });

  it('re-root SQL references indexed edge columns (proxy for EXPLAIN)', async () => {
    const { GET } = await import('@/app/api/graph/data/route');
    const { query } = await import('@/lib/db/client');
    const req = new Request(
      'http://x/api/graph/data?primaryTargetId=tgt-explain',
      { method: 'GET' }
    );
    const res = await GET(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(200);

    const mockQuery = query as jest.MockedFunction<typeof query>;
    const allSql = mockQuery.mock.calls
      .map((c) => String(c[0]))
      .join('\n---\n');
    // The contact re-root path references both indexed columns.
    expect(allSql).toMatch(/source_contact_id\s*=\s*\$1/);
    expect(allSql).toMatch(/target_contact_id\s*=\s*\$1/);
    // And the edges-of-visible-nodes path filters on the indexed
    // target_contact_id column via ANY().
    expect(allSql).toMatch(/e\.target_contact_id\s*=\s*ANY/);
  });
});
