// CrossRef enrichment-adapter: extract CrossRefs from enrichment results.

jest.mock('@/lib/db/client', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  healthCheck: jest.fn(),
  getPool: jest.fn(),
  shutdown: jest.fn(),
}));

describe('extractCrossRefsFromEnrichment', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('returns 0 and skips DB when ECC_CROSS_REFS is off', async () => {
    delete process.env.ECC_CROSS_REFS;
    const dbModule = await import('@/lib/db/client');
    const mockQuery = dbModule.query as jest.MockedFunction<typeof dbModule.query>;

    const { extractCrossRefsFromEnrichment } = await import('@/lib/ecc/cross-refs/enrichment-adapter');
    const result = await extractCrossRefsFromEnrichment('c1', { workHistory: [{ companyName: 'Acme' }] }, 'clearbit');
    expect(result).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('creates co_worker cross-refs from work history when flag on', async () => {
    process.env.ECC_CROSS_REFS = 'true';
    const dbModule = await import('@/lib/db/client');
    const mockQuery = dbModule.query as jest.MockedFunction<typeof dbModule.query>;

    // Sequence:
    // 1. coworkers lookup -> 1 coworker
    // 2. edge lookup (existing) -> 1 row
    // 3. cross_ref INSERT
    // 4. currentCompany colleagues lookup -> empty
    let callCount = 0;
    mockQuery.mockImplementation((sql: unknown) => {
      callCount++;
      const text = String(sql);
      if (text.includes('FROM contacts c') || text.includes('FROM contacts\n       WHERE current_company')) {
        if (callCount === 1) {
          return Promise.resolve({ rows: [{ id: 'coworker-1', title: 'Dev' }], command: '', rowCount: 1, oid: 0, fields: [] }) as unknown as ReturnType<typeof dbModule.query>;
        }
        return Promise.resolve({ rows: [], command: '', rowCount: 0, oid: 0, fields: [] }) as unknown as ReturnType<typeof dbModule.query>;
      }
      if (text.includes('SELECT id FROM edges') || text.includes('FROM edges')) {
        return Promise.resolve({ rows: [{ id: 'edge-1' }], command: '', rowCount: 1, oid: 0, fields: [] }) as unknown as ReturnType<typeof dbModule.query>;
      }
      if (text.includes('INSERT INTO cross_refs')) {
        return Promise.resolve({
          rows: [{
            id: 'cr-1', tenant_id: 'default', edge_id: 'edge-1',
            relation_type: 'co_worker', context: {}, confidence: 0.85,
            source: 'enrichment:clearbit', source_entity_id: null, bidirectional: true,
            created_at: 'x', updated_at: 'x',
          }],
          command: '', rowCount: 1, oid: 0, fields: [],
        }) as unknown as ReturnType<typeof dbModule.query>;
      }
      return Promise.resolve({ rows: [], command: '', rowCount: 0, oid: 0, fields: [] }) as unknown as ReturnType<typeof dbModule.query>;
    });

    const { extractCrossRefsFromEnrichment } = await import('@/lib/ecc/cross-refs/enrichment-adapter');
    const result = await extractCrossRefsFromEnrichment(
      'c1',
      {
        workHistory: [{ companyName: 'Acme', startDate: '2020', endDate: '2022' }],
      },
      'clearbit'
    );

    expect(result).toBe(1);
    const inserts = mockQuery.mock.calls.filter(c => String(c[0]).includes('INSERT INTO cross_refs'));
    expect(inserts.length).toBe(1);
  });

  it('skips work history entries without a company name', async () => {
    process.env.ECC_CROSS_REFS = 'true';
    const dbModule = await import('@/lib/db/client');
    const mockQuery = dbModule.query as jest.MockedFunction<typeof dbModule.query>;
    mockQuery.mockResolvedValue({ rows: [], command: '', rowCount: 0, oid: 0, fields: [] } as unknown as Awaited<ReturnType<typeof dbModule.query>>);

    const { extractCrossRefsFromEnrichment } = await import('@/lib/ecc/cross-refs/enrichment-adapter');
    const result = await extractCrossRefsFromEnrichment('c1', { workHistory: [{}] }, 'clearbit');
    expect(result).toBe(0);
  });

  it('creates shared_company cross-refs when currentCompany is provided', async () => {
    process.env.ECC_CROSS_REFS = 'true';
    const dbModule = await import('@/lib/db/client');
    const mockQuery = dbModule.query as jest.MockedFunction<typeof dbModule.query>;

    let stage = 0;
    mockQuery.mockImplementation((sql: unknown) => {
      stage++;
      const text = String(sql);
      if (text.includes('SELECT id FROM contacts')) {
        // stage 1 is colleagues lookup
        return Promise.resolve({ rows: [{ id: 'colleague-1' }], command: '', rowCount: 1, oid: 0, fields: [] }) as unknown as ReturnType<typeof dbModule.query>;
      }
      if (text.includes('FROM edges')) {
        return Promise.resolve({ rows: [{ id: 'edge-9' }], command: '', rowCount: 1, oid: 0, fields: [] }) as unknown as ReturnType<typeof dbModule.query>;
      }
      if (text.includes('INSERT INTO cross_refs')) {
        return Promise.resolve({
          rows: [{
            id: 'cr-share', tenant_id: 'default', edge_id: 'edge-9',
            relation_type: 'shared_company', context: {}, confidence: 0.95,
            source: 'enrichment:clearbit', source_entity_id: null, bidirectional: true,
            created_at: 'x', updated_at: 'x',
          }],
          command: '', rowCount: 1, oid: 0, fields: [],
        }) as unknown as ReturnType<typeof dbModule.query>;
      }
      return Promise.resolve({ rows: [], command: '', rowCount: 0, oid: 0, fields: [] }) as unknown as ReturnType<typeof dbModule.query>;
    });

    const { extractCrossRefsFromEnrichment } = await import('@/lib/ecc/cross-refs/enrichment-adapter');
    const result = await extractCrossRefsFromEnrichment('c1', { currentCompany: 'Acme' }, 'clearbit');
    expect(result).toBe(1);
    const inserts = mockQuery.mock.calls.filter(c => String(c[0]).includes('INSERT INTO cross_refs'));
    const params = inserts[0][1] as unknown[];
    expect(params[2]).toBe('shared_company');
    // Confidence for shared_company is 0.95
    expect(params[4]).toBe(0.95);
  });
});
