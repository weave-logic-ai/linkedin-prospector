// Integration: enrichment → ExoChain → CrossRefs wiring.

jest.mock('@/lib/db/client', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  healthCheck: jest.fn(),
  getPool: jest.fn(),
  shutdown: jest.fn(),
}));

jest.mock('@/lib/enrichment/waterfall', () => ({
  enrichContact: jest.fn(),
}));

jest.mock('@/lib/db/queries/enrichment', () => ({
  getActiveBudget: jest.fn(),
}));

function baseContact() {
  return {
    id: 'c1', linkedinUrl: 'https://linkedin.com/in/c1',
    firstName: 'Jane', lastName: 'Doe', fullName: 'Jane Doe',
    email: null, currentCompany: 'Acme', title: 'VP',
  };
}

describe('Enrich with chain (integration)', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('appends chain entries for each waterfall step when ECC_EXO_CHAIN=true', async () => {
    process.env.ECC_EXO_CHAIN = 'true';
    delete process.env.ECC_CROSS_REFS;

    const waterfallModule = await import('@/lib/enrichment/waterfall');
    (waterfallModule.enrichContact as jest.Mock).mockResolvedValue([
      { providerName: 'clearbit', success: true, costCents: 10, fields: [{ field: 'email' }], error: null },
    ]);

    const budgetModule = await import('@/lib/db/queries/enrichment');
    (budgetModule.getActiveBudget as jest.Mock).mockResolvedValue({ budgetCents: 1000, spentCents: 200 });

    const dbModule = await import('@/lib/db/client');
    const mockQuery = dbModule.query as jest.MockedFunction<typeof dbModule.query>;
    mockQuery.mockImplementation(() => Promise.resolve({
      rows: [{
        id: 'e', tenant_id: 'default', chain_id: 'x', sequence: 0,
        prev_hash: null, entry_hash: Buffer.from('ab'.repeat(16), 'hex'),
        operation: 'budget_check', data: {}, actor: 'system', created_at: 'x',
      }],
      command: '', rowCount: 1, oid: 0, fields: [],
    }) as unknown as ReturnType<typeof dbModule.query>);

    const { enrichContactWithChain } = await import('@/lib/ecc/exo-chain/enrichment-adapter');
    const result = await enrichContactWithChain(baseContact(), { targetFields: ['email'] });

    expect(result._chainId).toBeDefined();
    const chainInserts = mockQuery.mock.calls.filter(c => String(c[0]).includes('exo_chain_entries'));
    // budget_check, field_check, provider_select, enrich_result, budget_debit, waterfall_complete = 6
    expect(chainInserts.length).toBe(6);
  });

  it('extracts cross-refs when ECC_CROSS_REFS=true and enrichment has workHistory', async () => {
    process.env.ECC_CROSS_REFS = 'true';

    const dbModule = await import('@/lib/db/client');
    const mockQuery = dbModule.query as jest.MockedFunction<typeof dbModule.query>;
    mockQuery.mockImplementation((sql: unknown) => {
      const text = String(sql);
      if (text.includes('FROM contacts c')) {
        return Promise.resolve({ rows: [{ id: 'coworker-1', title: 'Dev' }], command: '', rowCount: 1, oid: 0, fields: [] }) as unknown as ReturnType<typeof dbModule.query>;
      }
      if (text.includes('FROM edges')) {
        return Promise.resolve({ rows: [{ id: 'edge-1' }], command: '', rowCount: 1, oid: 0, fields: [] }) as unknown as ReturnType<typeof dbModule.query>;
      }
      if (text.includes('INSERT INTO cross_refs')) {
        return Promise.resolve({
          rows: [{
            id: 'cr', tenant_id: 'default', edge_id: 'edge-1',
            relation_type: 'co_worker', context: {}, confidence: 0.85,
            source: 'enrichment:clearbit', source_entity_id: null, bidirectional: true,
            created_at: 'x', updated_at: 'x',
          }], command: '', rowCount: 1, oid: 0, fields: [],
        }) as unknown as ReturnType<typeof dbModule.query>;
      }
      return Promise.resolve({ rows: [], command: '', rowCount: 0, oid: 0, fields: [] }) as unknown as ReturnType<typeof dbModule.query>;
    });

    const { extractCrossRefsFromEnrichment } = await import('@/lib/ecc/cross-refs/enrichment-adapter');
    const n = await extractCrossRefsFromEnrichment('c1', {
      workHistory: [{ companyName: 'Acme' }],
    }, 'clearbit');
    expect(n).toBe(1);
  });
});
