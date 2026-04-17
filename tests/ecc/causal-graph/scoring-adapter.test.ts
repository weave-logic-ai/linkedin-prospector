// CausalGraph scoring-adapter tests:
// Verify it wraps the original scoring pipeline and records causal nodes when the
// ECC_CAUSAL_GRAPH flag is on; passes through when off.

jest.mock('@/lib/db/client', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  healthCheck: jest.fn(),
  getPool: jest.fn(),
  shutdown: jest.fn(),
}));

jest.mock('@/lib/scoring/pipeline', () => ({
  scoreContact: jest.fn(),
}));

function mockRows<T>(rows: T[]) {
  return Promise.resolve({ rows, command: '', rowCount: rows.length, oid: 0, fields: [] });
}

function baseScoreResult() {
  return {
    contactId: 'contact-1',
    score: {
      compositeScore: 0.72,
      tier: 'silver' as const,
      persona: 'warm-lead' as const,
      behavioralPersona: 'engaged-professional' as const,
      dimensions: [
        { dimension: 'icp_fit', rawValue: 0.8, weightedValue: 0.16, weight: 0.2, metadata: {} },
        { dimension: 'network_hub', rawValue: 0.5, weightedValue: 0.05, weight: 0.1, metadata: {} },
      ],
      scoringVersion: 1,
      referralLikelihood: null,
      referralTier: null,
      referralPersona: null,
      referralDimensions: null,
      behavioralSignals: null,
      referralSignals: null,
    },
    icpFits: [] as Array<{ icpProfileId: string; fitScore: number; breakdown: Record<string, unknown> }>,
  };
}

describe('CausalGraph scoring-adapter', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('falls through to pipeline scoreContact when ECC_CAUSAL_GRAPH is off', async () => {
    delete process.env.ECC_CAUSAL_GRAPH;

    // Dynamic import after resetModules so ECC_FLAGS and mocks rebuild cleanly.
    const pipelineModule = await import('@/lib/scoring/pipeline');
    const mockScoreContact = pipelineModule.scoreContact as jest.MockedFunction<typeof pipelineModule.scoreContact>;
    mockScoreContact.mockResolvedValue(baseScoreResult());

    const dbModule = await import('@/lib/db/client');
    const mockQuery = dbModule.query as jest.MockedFunction<typeof dbModule.query>;

    const { scoreContactWithProvenance } = await import('@/lib/ecc/causal-graph/scoring-adapter');

    const result = await scoreContactWithProvenance('contact-1');
    expect(mockScoreContact).toHaveBeenCalledWith('contact-1', undefined, undefined);
    expect(result).not.toHaveProperty('_causal');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('writes causal nodes and edges when ECC_CAUSAL_GRAPH is on', async () => {
    process.env.ECC_CAUSAL_GRAPH = 'true';

    const pipelineModule = await import('@/lib/scoring/pipeline');
    const mockScoreContact = pipelineModule.scoreContact as jest.MockedFunction<typeof pipelineModule.scoreContact>;
    mockScoreContact.mockResolvedValue(baseScoreResult());

    const dbModule = await import('@/lib/db/client');
    const mockQuery = dbModule.query as jest.MockedFunction<typeof dbModule.query>;

    let nodeCounter = 0;
    let edgeCounter = 0;
    mockQuery.mockImplementation((sql: unknown) => {
      const text = String(sql);
      if (text.includes('FROM tenants WHERE slug')) {
        return mockRows([{ id: 'default' }]) as ReturnType<typeof dbModule.query>;
      }
      if (text.includes('INSERT INTO causal_nodes')) {
        nodeCounter++;
        return mockRows([{
          id: `n-${nodeCounter}`, tenant_id: 'default', entity_type: 'score',
          entity_id: 'contact-1', operation: 'op', inputs: {}, output: {},
          session_id: null, created_at: 'x',
        }]) as ReturnType<typeof dbModule.query>;
      }
      if (text.includes('INSERT INTO causal_edges')) {
        edgeCounter++;
        return mockRows([{
          id: `e-${edgeCounter}`, source_node_id: 's', target_node_id: 't',
          relation: 'caused', weight: 1.0, metadata: {}, created_at: 'x',
        }]) as ReturnType<typeof dbModule.query>;
      }
      return mockRows([]) as ReturnType<typeof dbModule.query>;
    });

    const { scoreContactWithProvenance } = await import('@/lib/ecc/causal-graph/scoring-adapter');

    const result = await scoreContactWithProvenance('contact-1');
    expect(result).toHaveProperty('_causal');
    expect(result._causal?.rootNode).toBeDefined();
    expect(mockScoreContact).toHaveBeenCalledWith('contact-1', undefined, undefined);

    // 1 root + 3 nodes per dim (input, dimension, weight) * 2 dims = 7 node inserts
    const nodeInserts = mockQuery.mock.calls.filter(c => String(c[0]).includes('INSERT INTO causal_nodes'));
    expect(nodeInserts.length).toBe(7);

    // 3 edges per dim (input→dim, dim→weight, weight→root) = 6 edges
    const edgeInserts = mockQuery.mock.calls.filter(c => String(c[0]).includes('INSERT INTO causal_edges'));
    expect(edgeInserts.length).toBe(6);

    // One final UPDATE to set root output
    const updates = mockQuery.mock.calls.filter(c => String(c[0]).includes('UPDATE causal_nodes'));
    expect(updates.length).toBe(1);
  });

  it('forwards profileName to the underlying scoreContact', async () => {
    delete process.env.ECC_CAUSAL_GRAPH;

    const pipelineModule = await import('@/lib/scoring/pipeline');
    const mockScoreContact = pipelineModule.scoreContact as jest.MockedFunction<typeof pipelineModule.scoreContact>;
    mockScoreContact.mockResolvedValue(baseScoreResult());

    const { scoreContactWithProvenance } = await import('@/lib/ecc/causal-graph/scoring-adapter');
    await scoreContactWithProvenance('c1', 'Sales-focused');
    expect(mockScoreContact).toHaveBeenCalledWith('c1', 'Sales-focused', undefined);
  });
});
