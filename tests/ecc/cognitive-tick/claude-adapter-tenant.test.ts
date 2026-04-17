// WS-4 polish — cognitive-tick/claude-adapter tenant resolver.
//
// Proves `DEFAULT_TENANT_ID = 'default'` literal is gone: the adapter now
// resolves tenant via caller-override → target.tenant_id → default-tenant
// lookup. Same pattern as `ecc/causal-graph/scoring-adapter.ts` and
// `ecc/impulses/scoring-adapter.ts`.

jest.mock('@/lib/db/client', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  healthCheck: jest.fn(),
  getPool: jest.fn(),
  shutdown: jest.fn(),
}));

jest.mock('@/lib/claude/client', () => ({
  claudeChat: jest.fn().mockResolvedValue('analysis response'),
}));

jest.mock('@/lib/ecc/cognitive-tick/session-service', () => ({
  createSession: jest.fn(),
  getSession: jest.fn(),
  addSessionMessage: jest.fn().mockResolvedValue({}),
  getSessionMessages: jest.fn().mockResolvedValue([]),
  updateSessionContext: jest.fn().mockResolvedValue({}),
}));

// Override the flag so the adapter runs even when ECC_COGNITIVE_TICK is unset.
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

import { query } from '@/lib/db/client';
import { createSession } from '@/lib/ecc/cognitive-tick/session-service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockCreateSession = createSession as jest.MockedFunction<typeof createSession>;

function mockRows<T>(rows: T[]): ReturnType<typeof query> {
  return Promise.resolve({
    rows,
    command: '',
    rowCount: rows.length,
    oid: 0,
    fields: [],
  }) as ReturnType<typeof query>;
}

function stubSession(tenantId: string) {
  return {
    id: 'sess',
    tenantId,
    userId: 'u1',
    intent: { goal: 'analyze' },
    context: {},
    status: 'active' as const,
    createdAt: 'x',
    updatedAt: 'x',
    goalReminderShownAt: null,
  };
}

describe('cognitive-tick/claude-adapter — DEFAULT_TENANT_ID removed', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockImplementation(() => mockRows([]));
    mockCreateSession.mockReset();
    mockCreateSession.mockImplementation(async (tenantId: string) =>
      stubSession(tenantId)
    );
  });

  it('passes caller-supplied tenantId through unchanged', async () => {
    const { analyzeWithSession } = await import(
      '@/lib/ecc/cognitive-tick/claude-adapter'
    );
    await analyzeWithSession(
      'tenant-override',
      'u1',
      'c1',
      'Tell me',
      'Summary'
    );
    expect(mockCreateSession).toHaveBeenCalledWith(
      'tenant-override',
      'u1',
      expect.objectContaining({ goal: 'analyze' })
    );
  });

  it('resolves tenant from the target row when tenantId is undefined and targetId is supplied', async () => {
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

    const { analyzeWithSession } = await import(
      '@/lib/ecc/cognitive-tick/claude-adapter'
    );
    await analyzeWithSession(
      undefined,
      'u1',
      'c1',
      'Tell me',
      'Summary',
      undefined,
      'target-1'
    );
    expect(mockCreateSession).toHaveBeenCalledWith(
      'tenant-from-target',
      'u1',
      expect.any(Object)
    );
  });

  it('falls back to tenants.slug=default lookup when neither tenantId nor targetId is given', async () => {
    mockQuery.mockImplementation((sql: unknown) => {
      const text = String(sql);
      if (text.includes(`FROM tenants WHERE slug = 'default'`)) {
        return mockRows([{ id: 'tenant-default-uuid' }]);
      }
      return mockRows([]);
    });

    const { analyzeWithSession } = await import(
      '@/lib/ecc/cognitive-tick/claude-adapter'
    );
    await analyzeWithSession(undefined, 'u1', 'c1', 'Tell me', 'Summary');
    expect(mockCreateSession).toHaveBeenCalledWith(
      'tenant-default-uuid',
      'u1',
      expect.any(Object)
    );
  });
});
