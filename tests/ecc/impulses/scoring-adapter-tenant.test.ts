// WS-4 polish — impulses/scoring-adapter tenant resolver.
//
// Proves `DEFAULT_TENANT_ID = 'default'` literal is gone: the adapter now
// resolves tenant via caller-override → target.tenant_id → default-tenant
// lookup. Matches the pattern in `ecc/causal-graph/scoring-adapter.ts`.

jest.mock('@/lib/db/client', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  healthCheck: jest.fn(),
  getPool: jest.fn(),
  shutdown: jest.fn(),
}));

jest.mock('@/lib/ecc/impulses/emitter', () => ({
  emitImpulse: jest.fn().mockResolvedValue({ id: 'imp' }),
}));

// Override the flag so the adapter runs even when ECC_IMPULSES is unset.
// `ECC_FLAGS` is evaluated at module-load time, so env tweaks inside
// beforeEach would have no effect; a module-level mock is the safe path.
jest.mock('@/lib/ecc/types', () => ({
  ECC_FLAGS: {
    causalGraph: true,
    impulses: true,
    cognitiveTick: true,
    exoChain: true,
    crossRefs: true,
  },
}));

import { emitImpulse } from '@/lib/ecc/impulses/emitter';
import { emitScoringImpulses } from '@/lib/ecc/impulses/scoring-adapter';
import { query } from '@/lib/db/client';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockEmit = emitImpulse as jest.MockedFunction<typeof emitImpulse>;

function mockRows<T>(rows: T[]): ReturnType<typeof query> {
  return Promise.resolve({
    rows,
    command: '',
    rowCount: rows.length,
    oid: 0,
    fields: [],
  }) as ReturnType<typeof query>;
}

function baseScore(overrides: Record<string, unknown> = {}) {
  return {
    compositeScore: 0.8,
    tier: 'gold' as const,
    persona: 'champion' as const,
    behavioralPersona: 'engaged-professional' as const,
    referralLikelihood: null,
    referralTier: null,
    referralPersona: null,
    dimensions: [],
    scoringVersion: 1,
    behavioralSignals: null,
    referralDimensions: null,
    referralSignals: null,
    ...overrides,
  };
}

describe('impulses/scoring-adapter — DEFAULT_TENANT_ID removed', () => {
  beforeEach(() => {
    mockEmit.mockClear();
    mockEmit.mockResolvedValue({ id: 'imp' } as unknown as Awaited<ReturnType<typeof emitImpulse>>);
    mockQuery.mockReset();
    mockQuery.mockImplementation(() => mockRows([]));
  });

  it('uses caller-supplied tenantIdOverride as-is (no DB lookup)', async () => {
    await emitScoringImpulses('contact-1', null, baseScore(), 'tenant-override', undefined);
    expect(mockEmit).toHaveBeenCalled();
    const [tenantArg] = mockEmit.mock.calls[0];
    expect(tenantArg).toBe('tenant-override');
    // No DB lookups fired — the override short-circuits the resolver.
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('resolves tenant from the target row when only targetId is supplied', async () => {
    mockQuery.mockImplementation((sql: unknown) => {
      const text = String(sql);
      if (text.includes('FROM research_targets WHERE id')) {
        return mockRows([
          {
            id: 'target-1',
            tenant_id: 'tenant-from-target',
            kind: 'contact',
            owner_id: null,
            contact_id: 'c',
            company_id: null,
            label: 'x',
            pinned: false,
            created_at: 'x',
            updated_at: 'x',
            last_used_at: 'x',
          },
        ]);
      }
      return mockRows([]);
    });

    await emitScoringImpulses('contact-1', null, baseScore(), undefined, 'target-1');
    expect(mockEmit.mock.calls[0][0]).toBe('tenant-from-target');
  });

  it('falls back to tenants.slug=default lookup when neither override nor targetId is given', async () => {
    mockQuery.mockImplementation((sql: unknown) => {
      const text = String(sql);
      if (text.includes(`FROM tenants WHERE slug = 'default'`)) {
        return mockRows([{ id: 'tenant-default-uuid' }]);
      }
      return mockRows([]);
    });

    await emitScoringImpulses('contact-1', null, baseScore());
    expect(mockEmit.mock.calls[0][0]).toBe('tenant-default-uuid');
  });
});
