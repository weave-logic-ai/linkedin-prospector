// Feature-flag independence test: each ECC flag must toggle its module without
// affecting the others. All off → zero side effects. Any one on → that adapter
// writes; the others do not.

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

jest.mock('@/lib/enrichment/waterfall', () => ({
  enrichContact: jest.fn(),
}));

jest.mock('@/lib/db/queries/enrichment', () => ({
  getActiveBudget: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/lib/claude/client', () => ({
  claudeChat: jest.fn().mockResolvedValue('stateless'),
}));

const ALL_FLAGS = [
  'ECC_CAUSAL_GRAPH',
  'ECC_EXO_CHAIN',
  'ECC_IMPULSES',
  'ECC_COGNITIVE_TICK',
  'ECC_CROSS_REFS',
];

function clearAllFlags() {
  for (const f of ALL_FLAGS) delete process.env[f];
}

function baseScoreResult() {
  return {
    contactId: 'c1',
    score: {
      compositeScore: 0.5, tier: 'silver' as const, persona: 'warm-lead' as const,
      behavioralPersona: 'engaged-professional' as const,
      dimensions: [{ dimension: 'icp_fit', rawValue: 0.5, weightedValue: 0.1, weight: 0.2, metadata: {} }],
      scoringVersion: 1,
      referralLikelihood: null, referralTier: null, referralPersona: null,
      referralDimensions: null, behavioralSignals: null, referralSignals: null,
    },
    icpFits: [] as Array<{ icpProfileId: string; fitScore: number; breakdown: Record<string, unknown> }>,
  };
}

describe('ECC feature flags', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    clearAllFlags();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('ECC_FLAGS object reflects env vars at module load time', async () => {
    process.env.ECC_CAUSAL_GRAPH = 'true';
    process.env.ECC_EXO_CHAIN = 'false';
    const { ECC_FLAGS } = await import('@/lib/ecc/types');
    expect(ECC_FLAGS.causalGraph).toBe(true);
    expect(ECC_FLAGS.exoChain).toBe(false);
    expect(ECC_FLAGS.impulses).toBe(false);
  });

  it('all flags off: scoring adapter is a pure passthrough', async () => {
    const pipelineModule = await import('@/lib/scoring/pipeline');
    (pipelineModule.scoreContact as jest.Mock).mockResolvedValue(baseScoreResult());
    const dbModule = await import('@/lib/db/client');
    const mockQuery = dbModule.query as jest.MockedFunction<typeof dbModule.query>;

    const { scoreContactWithProvenance } = await import('@/lib/ecc/causal-graph/scoring-adapter');
    const result = await scoreContactWithProvenance('c1');
    expect(result).not.toHaveProperty('_causal');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('all flags off: enrichment adapter returns no _chainId', async () => {
    const waterfallModule = await import('@/lib/enrichment/waterfall');
    (waterfallModule.enrichContact as jest.Mock).mockResolvedValue([]);
    const dbModule = await import('@/lib/db/client');
    const mockQuery = dbModule.query as jest.MockedFunction<typeof dbModule.query>;

    const { enrichContactWithChain } = await import('@/lib/ecc/exo-chain/enrichment-adapter');
    const result = await enrichContactWithChain({
      id: 'c1', linkedinUrl: 'https://linkedin.com/in/c1',
      firstName: null, lastName: null, fullName: 'C',
      email: null, currentCompany: null, title: null,
    });
    expect(result._chainId).toBeUndefined();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('all flags off: impulse scoring adapter emits nothing', async () => {
    const dbModule = await import('@/lib/db/client');
    const mockQuery = dbModule.query as jest.MockedFunction<typeof dbModule.query>;
    const { emitScoringImpulses } = await import('@/lib/ecc/impulses/scoring-adapter');
    await emitScoringImpulses('c1', null, baseScoreResult().score);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('all flags off: cross-ref adapter returns 0 and skips DB', async () => {
    const dbModule = await import('@/lib/db/client');
    const mockQuery = dbModule.query as jest.MockedFunction<typeof dbModule.query>;
    const { extractCrossRefsFromEnrichment } = await import('@/lib/ecc/cross-refs/enrichment-adapter');
    const n = await extractCrossRefsFromEnrichment('c1', { workHistory: [{ companyName: 'X' }] }, 'p');
    expect(n).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('ECC_CAUSAL_GRAPH alone activates causal graph without affecting impulse/cross-ref writes', async () => {
    process.env.ECC_CAUSAL_GRAPH = 'true';

    const pipelineModule = await import('@/lib/scoring/pipeline');
    (pipelineModule.scoreContact as jest.Mock).mockResolvedValue(baseScoreResult());

    const dbModule = await import('@/lib/db/client');
    const mockQuery = dbModule.query as jest.MockedFunction<typeof dbModule.query>;
    mockQuery.mockImplementation(() => Promise.resolve({
      rows: [{
        id: 'n', tenant_id: 'default', entity_type: 'score', entity_id: 'c1',
        operation: 'op', inputs: {}, output: {}, session_id: null, created_at: 'x',
        source_node_id: 'a', target_node_id: 'b', relation: 'caused', weight: 1.0, metadata: {},
      }], command: '', rowCount: 1, oid: 0, fields: [],
    }) as unknown as ReturnType<typeof dbModule.query>);

    const { scoreContactWithProvenance } = await import('@/lib/ecc/causal-graph/scoring-adapter');
    await scoreContactWithProvenance('c1');

    // Causal graph wrote nodes/edges
    const causalWrites = mockQuery.mock.calls.filter(c => String(c[0]).includes('causal_'));
    expect(causalWrites.length).toBeGreaterThan(0);

    // Impulse side: no impulse emission (separate adapter, only fires when ECC_IMPULSES=true).
    const { emitScoringImpulses } = await import('@/lib/ecc/impulses/scoring-adapter');
    mockQuery.mockClear();
    await emitScoringImpulses('c1', null, baseScoreResult().score);
    const impulseInserts = mockQuery.mock.calls.filter(c => String(c[0]).includes('impulses'));
    expect(impulseInserts.length).toBe(0);
  });

  it('ECC_EXO_CHAIN alone activates chain writes but not cross-refs', async () => {
    process.env.ECC_EXO_CHAIN = 'true';

    const waterfallModule = await import('@/lib/enrichment/waterfall');
    (waterfallModule.enrichContact as jest.Mock).mockResolvedValue([]);
    const budgetModule = await import('@/lib/db/queries/enrichment');
    (budgetModule.getActiveBudget as jest.Mock).mockResolvedValue(null);

    const dbModule = await import('@/lib/db/client');
    const mockQuery = dbModule.query as jest.MockedFunction<typeof dbModule.query>;
    mockQuery.mockImplementation(() => Promise.resolve({
      rows: [{
        id: 'e', tenant_id: 'default', chain_id: 'x', sequence: 0,
        prev_hash: null, entry_hash: Buffer.from('ab'.repeat(16), 'hex'),
        operation: 'budget_check', data: {}, actor: 'system', created_at: 'x',
      }], command: '', rowCount: 1, oid: 0, fields: [],
    }) as unknown as ReturnType<typeof dbModule.query>);

    const { enrichContactWithChain } = await import('@/lib/ecc/exo-chain/enrichment-adapter');
    const result = await enrichContactWithChain({
      id: 'c1', linkedinUrl: 'https://linkedin.com/in/c1',
      firstName: null, lastName: null, fullName: 'C',
      email: null, currentCompany: null, title: null,
    });
    expect(result._chainId).toBeDefined();

    // Cross-ref adapter, called separately, must still be a no-op.
    mockQuery.mockClear();
    const { extractCrossRefsFromEnrichment } = await import('@/lib/ecc/cross-refs/enrichment-adapter');
    const n = await extractCrossRefsFromEnrichment('c1', { workHistory: [{ companyName: 'X' }] }, 'p');
    expect(n).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('ECC_COGNITIVE_TICK alone enables session persistence without touching other modules', async () => {
    process.env.ECC_COGNITIVE_TICK = 'true';

    const claudeModule = await import('@/lib/claude/client');
    (claudeModule.claudeChat as jest.Mock).mockResolvedValue('ok');

    const dbModule = await import('@/lib/db/client');
    const mockQuery = dbModule.query as jest.MockedFunction<typeof dbModule.query>;
    mockQuery.mockImplementation((sql: unknown) => {
      const text = String(sql);
      if (text.includes('INSERT INTO research_sessions')) {
        return Promise.resolve({
          rows: [{
            id: 'sess-1', tenant_id: 't', user_id: 'u1',
            intent: {}, context: {}, status: 'active',
            created_at: 'x', updated_at: 'x',
          }], command: '', rowCount: 1, oid: 0, fields: [],
        }) as unknown as ReturnType<typeof dbModule.query>;
      }
      if (text.includes('INSERT INTO session_messages')) {
        return Promise.resolve({
          rows: [{ id: 'm', session_id: 's', role: 'user', content: '', context_snapshot: {}, tokens_used: 0, created_at: 'x' }],
          command: '', rowCount: 1, oid: 0, fields: [],
        }) as unknown as ReturnType<typeof dbModule.query>;
      }
      return Promise.resolve({ rows: [], command: '', rowCount: 0, oid: 0, fields: [] }) as unknown as ReturnType<typeof dbModule.query>;
    });

    const { analyzeWithSession } = await import('@/lib/ecc/cognitive-tick/claude-adapter');
    const res = await analyzeWithSession('t', 'u1', 'c1', 'prompt', 'summary');
    expect(res.sessionId).toBe('sess-1');

    // No causal_graph, impulses, cross_refs writes
    const sql = mockQuery.mock.calls.map(c => String(c[0])).join('\n');
    expect(sql).not.toMatch(/causal_/);
    expect(sql).not.toMatch(/INSERT INTO impulses/);
    expect(sql).not.toMatch(/INSERT INTO cross_refs/);
  });
});
