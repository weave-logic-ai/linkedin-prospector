// Integration test: scoring → causal graph → impulse emission wiring.
// Mocks all adapter boundaries; verifies the wiring shape, not internals.

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

function baseResult() {
  return {
    contactId: 'c1',
    score: {
      compositeScore: 0.85,
      tier: 'gold' as const,
      persona: 'buyer' as const,
      behavioralPersona: 'super-connector' as const,
      dimensions: [
        { dimension: 'icp_fit', rawValue: 0.9, weightedValue: 0.18, weight: 0.2, metadata: {} },
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

describe('Score with provenance (integration)', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('scoring adapter writes causal_nodes when ECC_CAUSAL_GRAPH=true', async () => {
    process.env.ECC_CAUSAL_GRAPH = 'true';
    delete process.env.ECC_IMPULSES;

    const pipelineModule = await import('@/lib/scoring/pipeline');
    (pipelineModule.scoreContact as jest.Mock).mockResolvedValue(baseResult());

    const dbModule = await import('@/lib/db/client');
    const mockQuery = dbModule.query as jest.MockedFunction<typeof dbModule.query>;
    mockQuery.mockImplementation(() => Promise.resolve({
      rows: [{
        id: `n-${Math.random()}`, tenant_id: 'default',
        entity_type: 'score', entity_id: 'c1',
        operation: 'op', inputs: {}, output: {}, session_id: null, created_at: 'x',
        source_node_id: 'a', target_node_id: 'b',
        relation: 'caused', weight: 1.0, metadata: {},
      }], command: '', rowCount: 1, oid: 0, fields: [],
    }) as unknown as ReturnType<typeof dbModule.query>);

    const { scoreContactWithProvenance } = await import('@/lib/ecc/causal-graph/scoring-adapter');
    const result = await scoreContactWithProvenance('c1');

    expect(result._causal).toBeDefined();
    const causalInserts = mockQuery.mock.calls.filter(c => String(c[0]).includes('causal_nodes') || String(c[0]).includes('causal_edges'));
    expect(causalInserts.length).toBeGreaterThan(0);
  });

  it('impulse scoring adapter emits score_computed + tier_changed when tier differs', async () => {
    process.env.ECC_IMPULSES = 'true';

    const dbModule = await import('@/lib/db/client');
    const mockQuery = dbModule.query as jest.MockedFunction<typeof dbModule.query>;
    // Each emit: INSERT into impulses (returning row). Dispatch will try to load impulse + handlers.
    mockQuery.mockImplementation((sql: unknown) => {
      const text = String(sql);
      if (text.includes('INSERT INTO impulses')) {
        return Promise.resolve({
          rows: [{
            id: `imp-${Math.random()}`, tenant_id: 'default',
            impulse_type: 'score_computed', source_entity_type: 'contact',
            source_entity_id: 'c1', payload: {}, created_at: 'x',
          }], command: '', rowCount: 1, oid: 0, fields: [],
        }) as unknown as ReturnType<typeof dbModule.query>;
      }
      // WS-4 polish: the impulses adapter no longer hardcodes
      // 'default' as the tenant id. It calls `getDefaultTenantId()` which
      // looks up `tenants.slug='default'` — feed it a synthetic row so the
      // resolver returns a value.
      if (text.includes(`FROM tenants WHERE slug = 'default'`)) {
        return Promise.resolve({
          rows: [{ id: 'default' }], command: '', rowCount: 1, oid: 0, fields: [],
        }) as unknown as ReturnType<typeof dbModule.query>;
      }
      // Dispatcher: load impulse then handlers then ack
      return Promise.resolve({ rows: [], command: '', rowCount: 0, oid: 0, fields: [] }) as unknown as ReturnType<typeof dbModule.query>;
    });

    const { emitScoringImpulses } = await import('@/lib/ecc/impulses/scoring-adapter');

    // Silence dispatcher rejection logging (dispatch will try to re-load impulse and fail).
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const oldScore = { ...baseResult().score, tier: 'silver' as const, persona: 'warm-lead' as const };
    const newScore = baseResult().score;

    await emitScoringImpulses('c1', oldScore, newScore);
    // Allow background dispatch catches to settle
    await new Promise<void>(resolve => setImmediate(resolve));

    const impulseInserts = mockQuery.mock.calls.filter(c => String(c[0]).includes('INSERT INTO impulses'));
    // Expect 3 impulses: score_computed, tier_changed, persona_assigned
    expect(impulseInserts.length).toBe(3);
    errSpy.mockRestore();
  });

  it('impulse scoring adapter is a no-op when ECC_IMPULSES=false', async () => {
    delete process.env.ECC_IMPULSES;
    const dbModule = await import('@/lib/db/client');
    const mockQuery = dbModule.query as jest.MockedFunction<typeof dbModule.query>;

    const { emitScoringImpulses } = await import('@/lib/ecc/impulses/scoring-adapter');
    await emitScoringImpulses('c1', null, baseResult().score);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
