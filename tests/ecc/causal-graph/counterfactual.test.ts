// Counterfactual scoring tests

jest.mock('@/lib/db/client', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  healthCheck: jest.fn(),
  getPool: jest.fn(),
  shutdown: jest.fn(),
}));

import { query } from '@/lib/db/client';
import { counterfactualScore } from '@/lib/ecc/causal-graph/counterfactual';

const mockQuery = query as jest.MockedFunction<typeof query>;

function mockRows<T>(rows: T[]): ReturnType<typeof query> {
  return Promise.resolve({ rows, command: '', rowCount: rows.length, oid: 0, fields: [] }) as ReturnType<typeof query>;
}

describe('counterfactualScore', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns null when no root causal node exists for the contact', async () => {
    mockQuery.mockReturnValueOnce(mockRows([]));
    const result = await counterfactualScore('t', 'contact-1', { icp_fit: 0.5 });
    expect(result).toBeNull();
  });

  it('computes diff when modifying a weight', async () => {
    mockQuery.mockReturnValueOnce(mockRows([{
      id: 'root', tenant_id: 't', entity_type: 'score', entity_id: 'contact-1',
      operation: 'score', inputs: {}, output: { compositeScore: 0.5, tier: 'silver', persona: 'warm-lead' },
      session_id: null, created_at: 'x',
    }]));
    mockQuery.mockReturnValueOnce(mockRows([
      {
        id: 'w1', tenant_id: 't', entity_type: 'weight', entity_id: 'icp_fit',
        operation: 'apply_weight',
        inputs: { raw: 0.8, weight: 0.2 },
        output: { weighted: 0.16 },
        session_id: null, created_at: 'x',
      },
      {
        id: 'w2', tenant_id: 't', entity_type: 'weight', entity_id: 'network_hub',
        operation: 'apply_weight',
        inputs: { raw: 0.5, weight: 0.8 },
        output: { weighted: 0.4 },
        session_id: null, created_at: 'x',
      },
    ]));

    const result = await counterfactualScore('t', 'contact-1', { icp_fit: 0.5 });

    expect(result).not.toBeNull();
    expect(result!.original.compositeScore).toBe(0.5);
    expect(result!.original.tier).toBe('silver');

    // dimensionDeltas: icp_fit weight moved 0.2→0.5
    //   old 0.8*0.2 = 0.16, new 0.8*0.5 = 0.40, delta = 0.24
    // network_hub weight unchanged (0.8) → delta 0
    expect(result!.diff.dimensionDeltas['icp_fit']).toBeCloseTo(0.24, 5);
    expect(result!.diff.dimensionDeltas['network_hub']).toBeCloseTo(0, 5);

    // Counterfactual composite is normalized by sum of weights (0.5 + 0.8 = 1.3):
    //   (0.8*0.5 + 0.5*0.8) / 1.3 ≈ (0.4 + 0.4) / 1.3 ≈ 0.6154
    expect(result!.counterfactual.compositeScore).toBeGreaterThan(0.5);

    expect(typeof result!.diff.tierChanged).toBe('boolean');
    expect(result!.diff.personaChanged).toBe(false);
  });

  it('keeps composite score when weights total exactly 1', async () => {
    mockQuery.mockReturnValueOnce(mockRows([{
      id: 'root', tenant_id: 't', entity_type: 'score', entity_id: 'c1',
      operation: 'score', inputs: {},
      output: { compositeScore: 0.5, tier: 'silver', persona: 'warm-lead' },
      session_id: null, created_at: 'x',
    }]));
    mockQuery.mockReturnValueOnce(mockRows([
      {
        id: 'w1', tenant_id: 't', entity_type: 'weight', entity_id: 'icp_fit',
        operation: 'apply_weight',
        inputs: { raw: 0.5, weight: 0.5 },
        output: { weighted: 0.25 },
        session_id: null, created_at: 'x',
      },
      {
        id: 'w2', tenant_id: 't', entity_type: 'weight', entity_id: 'network_hub',
        operation: 'apply_weight',
        inputs: { raw: 0.5, weight: 0.5 },
        output: { weighted: 0.25 },
        session_id: null, created_at: 'x',
      },
    ]));

    const result = await counterfactualScore('t', 'c1', {});
    // Both weights unchanged, totalWeight = 1.0, newComposite = 0.25+0.25 = 0.5
    expect(result!.counterfactual.compositeScore).toBeCloseTo(0.5, 3);
    expect(result!.diff.compositeScoreDelta).toBeCloseTo(0, 3);
  });
});
