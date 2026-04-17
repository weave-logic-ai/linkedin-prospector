// Research Tools Sprint — WS-4 Phase 1.5 lens-service unit tests.
//
// Exercises `getActiveLensForTarget` / `getActiveLensIcps` /
// `createLensForTarget` / `activateLensForTarget` against a mocked pg
// client. The lens ↔ ICP association lives in `research_lenses.config`
// JSONB as `icpProfileIds` (see module-level notes in lens-service.ts), so
// these tests pin the exact JSONB shape and the is_default activation
// semantics that stand in for a `last_used_lens_id` column.

jest.mock('@/lib/db/client', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  healthCheck: jest.fn(),
  getPool: jest.fn(),
  shutdown: jest.fn(),
}));

function mockRows<T>(rows: T[]) {
  return Promise.resolve({ rows, command: '', rowCount: rows.length, oid: 0, fields: [] });
}

describe('targets/lens-service', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('getActiveLensForTarget returns null when no lenses exist', async () => {
    const { query } = await import('@/lib/db/client');
    (query as jest.MockedFunction<typeof query>).mockImplementation(() =>
      mockRows<Record<string, unknown>>([]) as ReturnType<typeof query>
    );
    const svc = await import('@/lib/targets/lens-service');
    const lens = await svc.getActiveLensForTarget('target-1');
    expect(lens).toBeNull();
  });

  it('getActiveLensForTarget picks the default lens first, then oldest', async () => {
    const { query } = await import('@/lib/db/client');
    // After migration 045 the service first checks
    // research_target_state.last_used_lens_id (returns null here so we
    // exercise the fall-through path) then ORDER BYs is_default DESC,
    // created_at ASC.
    (query as jest.MockedFunction<typeof query>).mockImplementation((sql: unknown) => {
      const text = String(sql);
      if (text.includes('last_used_lens_id')) {
        return mockRows<Record<string, unknown>>([
          { last_used_lens_id: null },
        ]) as ReturnType<typeof query>;
      }
      return mockRows<Record<string, unknown>>([
        {
          id: 'lens-default',
          tenant_id: 't',
          user_id: null,
          name: 'As consultant',
          primary_target_id: 'target-1',
          secondary_target_id: null,
          config: { icpProfileIds: ['icp-1', 'icp-2'] },
          is_default: true,
          created_at: 'a',
          updated_at: 'a',
        },
        {
          id: 'lens-older',
          tenant_id: 't',
          user_id: null,
          name: 'As board member',
          primary_target_id: 'target-1',
          secondary_target_id: null,
          config: { icpProfileIds: ['icp-3'] },
          is_default: false,
          created_at: 'b',
          updated_at: 'b',
        },
      ]) as ReturnType<typeof query>;
    });
    const svc = await import('@/lib/targets/lens-service');
    const lens = await svc.getActiveLensForTarget('target-1');
    expect(lens?.id).toBe('lens-default');
    expect(lens?.isDefault).toBe(true);
  });

  it('getActiveLensIcps reads icpProfileIds from config JSONB and filters inactive', async () => {
    const { query } = await import('@/lib/db/client');
    const mockQuery = query as jest.MockedFunction<typeof query>;
    mockQuery.mockImplementation((sql: unknown) => {
      const text = String(sql);
      if (text.includes('last_used_lens_id')) {
        return mockRows<Record<string, unknown>>([
          { last_used_lens_id: null },
        ]) as ReturnType<typeof query>;
      }
      if (text.includes('FROM research_lenses')) {
        return mockRows<Record<string, unknown>>([
          {
            id: 'lens-1',
            tenant_id: 't',
            user_id: null,
            name: 'As candidate',
            primary_target_id: 'target-1',
            secondary_target_id: null,
            config: { icpProfileIds: ['icp-a', 'icp-b'] },
            is_default: true,
            created_at: 'x',
            updated_at: 'x',
          },
        ]) as ReturnType<typeof query>;
      }
      if (text.includes('FROM icp_profiles') && text.includes('ANY($1')) {
        // Return only the active ICP so we verify the filter fires.
        return mockRows<Record<string, unknown>>([
          {
            id: 'icp-a',
            name: 'Active ICP',
            description: null,
            is_active: true,
            criteria: { roles: ['CTO'] },
            weight_overrides: {},
            created_at: 'x',
            updated_at: 'x',
          },
        ]) as ReturnType<typeof query>;
      }
      return mockRows<Record<string, unknown>>([]) as ReturnType<typeof query>;
    });

    const svc = await import('@/lib/targets/lens-service');
    const icps = await svc.getActiveLensIcps('target-1');
    expect(icps).toHaveLength(1);
    expect(icps[0].id).toBe('icp-a');
    expect(icps[0].isActive).toBe(true);
  });

  it('getActiveLensIcps returns [] when the lens has no icpProfileIds in config', async () => {
    const { query } = await import('@/lib/db/client');
    (query as jest.MockedFunction<typeof query>).mockImplementation((sql: unknown) => {
      const text = String(sql);
      if (text.includes('last_used_lens_id')) {
        return mockRows<Record<string, unknown>>([
          { last_used_lens_id: null },
        ]) as ReturnType<typeof query>;
      }
      return mockRows<Record<string, unknown>>([
        {
          id: 'lens-1',
          tenant_id: 't',
          user_id: null,
          name: 'Empty lens',
          primary_target_id: 'target-1',
          secondary_target_id: null,
          config: {},
          is_default: true,
          created_at: 'x',
          updated_at: 'x',
        },
      ]) as ReturnType<typeof query>;
    });
    const svc = await import('@/lib/targets/lens-service');
    const icps = await svc.getActiveLensIcps('target-1');
    expect(icps).toEqual([]);
  });

  it('createLensForTarget marks the first lens for a target as default', async () => {
    const { query } = await import('@/lib/db/client');
    const mockQuery = query as jest.MockedFunction<typeof query>;
    const insertCalls: Array<{ params: unknown[] }> = [];
    mockQuery.mockImplementation((sql: unknown, params?: unknown[]) => {
      const text = String(sql);
      if (text.includes('last_used_lens_id')) {
        return mockRows<Record<string, unknown>>([
          { last_used_lens_id: null },
        ]) as ReturnType<typeof query>;
      }
      if (text.includes('SELECT *') && text.includes('FROM research_lenses')) {
        // No existing lenses — so the new lens should be marked default.
        return mockRows<Record<string, unknown>>([]) as ReturnType<typeof query>;
      }
      if (text.includes('INSERT INTO research_lenses')) {
        insertCalls.push({ params: params ?? [] });
        return mockRows<Record<string, unknown>>([
          {
            id: 'lens-new',
            tenant_id: 't',
            user_id: null,
            name: 'First lens',
            primary_target_id: 'target-1',
            secondary_target_id: null,
            config: { icpProfileIds: ['icp-1'] },
            is_default: (params?.[6] as boolean) ?? false,
            created_at: 'x',
            updated_at: 'x',
          },
        ]) as ReturnType<typeof query>;
      }
      return mockRows<Record<string, unknown>>([]) as ReturnType<typeof query>;
    });

    const svc = await import('@/lib/targets/lens-service');
    const lens = await svc.createLensForTarget({
      targetId: 'target-1',
      tenantId: 't',
      name: 'First lens',
      icpProfileIds: ['icp-1'],
    });
    expect(lens.isDefault).toBe(true);
    expect(insertCalls).toHaveLength(1);
    // param[6] is is_default — the 7th bound arg.
    expect(insertCalls[0].params[6]).toBe(true);
    // param[5] is the JSON-encoded config with icpProfileIds.
    expect(JSON.parse(insertCalls[0].params[5] as string)).toEqual({
      icpProfileIds: ['icp-1'],
    });
  });

  it('activateLensForTarget writes last_used_lens_id inside a transaction (migration 045)', async () => {
    const { query, transaction } = await import('@/lib/db/client');
    void query;
    const clientQueries: Array<{ sql: string; params: unknown[] }> = [];
    const clientStub = {
      query: (sql: string, params?: unknown[]) => {
        clientQueries.push({ sql, params: params ?? [] });
        if (sql.includes('SELECT * FROM research_lenses') && sql.includes('primary_target_id')) {
          return mockRows<Record<string, unknown>>([
            {
              id: 'lens-2',
              tenant_id: 't',
              user_id: null,
              name: 'Activated',
              primary_target_id: 'target-1',
              secondary_target_id: null,
              config: {},
              is_default: false,
              created_at: 'x',
              updated_at: 'x',
            },
          ]);
        }
        if (sql.includes('SELECT id FROM research_lenses')) {
          // No existing default — activate should opportunistically promote.
          return mockRows<Record<string, unknown>>([]);
        }
        if (sql.includes('UPDATE research_lenses') && sql.includes('is_default = TRUE')) {
          return mockRows<Record<string, unknown>>([
            {
              id: 'lens-2',
              tenant_id: 't',
              user_id: null,
              name: 'Activated',
              primary_target_id: 'target-1',
              secondary_target_id: null,
              config: {},
              is_default: true,
              created_at: 'x',
              updated_at: 'x',
            },
          ]);
        }
        return mockRows<Record<string, unknown>>([]);
      },
    };
    (transaction as jest.MockedFunction<typeof transaction>).mockImplementation(
      async (fn) => fn(clientStub as unknown as Parameters<typeof fn>[0])
    );

    const svc = await import('@/lib/targets/lens-service');
    const lens = await svc.activateLensForTarget('target-1', 'lens-2');
    expect(lens?.id).toBe('lens-2');
    // Migration 045: the authoritative "active lens" pointer lives on the
    // state row, so the key assertion is that we wrote it there.
    const stateWrite = clientQueries.find(
      (q) =>
        q.sql.includes('UPDATE research_target_state') &&
        q.sql.includes('last_used_lens_id = $1')
    );
    expect(stateWrite).toBeDefined();
    expect(stateWrite?.params[0]).toBe('lens-2');
    // No sibling "UPDATE ... is_default = FALSE" writes: we no longer flip
    // other rows — is_default is a hint, not an activation switch.
    const siblingClear = clientQueries.find((q) =>
      q.sql.includes('UPDATE research_lenses') &&
      q.sql.includes('is_default = FALSE')
    );
    expect(siblingClear).toBeUndefined();
  });

  it('activateLensForTarget returns null when the lens does not belong to the target', async () => {
    const { transaction } = await import('@/lib/db/client');
    (transaction as jest.MockedFunction<typeof transaction>).mockImplementation(
      async (fn) =>
        fn({
          query: () => mockRows<Record<string, unknown>>([]),
        } as unknown as Parameters<typeof fn>[0])
    );
    const svc = await import('@/lib/targets/lens-service');
    const lens = await svc.activateLensForTarget('target-1', 'bad-lens');
    expect(lens).toBeNull();
  });
});
