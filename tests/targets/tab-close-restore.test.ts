// WS-4 polish — tab-close-restore flow.
//
// The server-side restore is already in place: the (app) layout mounts
// `TargetSurface`, which reads `research_target_state` on every page load.
// The missing piece was "if the pointed-to target was deleted (contact
// archived, company merged), silently clear the state row to default."
//
// This test exercises `getResearchTargetState` in the case where the
// secondary target row exists but all three subject FKs (owner_id,
// contact_id, company_id) are NULL — the signature of a target whose
// underlying entity was ON DELETE SET NULL'd. The service must clear
// `secondary_target_id` in place and return state with a null secondary.

jest.mock('@/lib/db/client', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  healthCheck: jest.fn(),
  getPool: jest.fn(),
  shutdown: jest.fn(),
}));

import { query } from '@/lib/db/client';

const mockQuery = query as jest.MockedFunction<typeof query>;

function mockRows<T>(rows: T[]): ReturnType<typeof query> {
  return Promise.resolve({
    rows,
    command: '',
    rowCount: rows.length,
    oid: 0,
    fields: [],
  }) as ReturnType<typeof query>;
}

describe('getResearchTargetState — tab-close-restore with deleted target', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('silently clears secondary_target_id when the secondary target has no surviving entity', async () => {
    let clearFired = false;

    mockQuery.mockImplementation((sql: unknown, params?: unknown[]) => {
      const text = String(sql);

      // getOrCreateSelfTarget: existing self target lookup
      if (
        text.includes('SELECT * FROM research_targets') &&
        text.includes("kind = 'self'")
      ) {
        return mockRows([
          {
            id: 'self-target',
            tenant_id: 'tenant-1',
            kind: 'self',
            owner_id: 'owner-1',
            contact_id: null,
            company_id: null,
            label: 'Self',
            pinned: false,
            created_at: 'x',
            updated_at: 'x',
            last_used_at: 'x',
          },
        ]);
      }

      // getDefaultTenantId
      if (text.includes(`FROM tenants WHERE slug = 'default'`)) {
        return mockRows([{ id: 'tenant-1' }]);
      }

      // INSERT INTO research_target_state ... ON CONFLICT ... RETURNING *
      if (text.includes('INSERT INTO research_target_state')) {
        return mockRows([
          {
            tenant_id: 'tenant-1',
            user_id: 'owner-1',
            primary_target_id: 'self-target',
            secondary_target_id: 'dangling-target',
            updated_at: 'x',
          },
        ]);
      }

      // Dangling-target lookup: all three subject FKs NULL.
      if (
        text.includes('SELECT owner_id, contact_id, company_id') &&
        text.includes('research_targets')
      ) {
        return mockRows([
          { owner_id: null, contact_id: null, company_id: null },
        ]);
      }

      // The silent-clear UPDATE.
      if (
        text.includes('UPDATE research_target_state') &&
        text.includes('secondary_target_id = NULL')
      ) {
        clearFired = true;
        return mockRows([]);
      }

      return mockRows([]);
    });

    // Imported here so the mock is visible.
    const { getResearchTargetState } = await import('@/lib/targets/service');
    const state = await getResearchTargetState('owner-1');

    expect(state?.secondaryTargetId).toBeNull();
    expect(clearFired).toBe(true);
  });

  it('leaves secondary_target_id alone when the target still has a valid entity FK', async () => {
    let clearFired = false;

    mockQuery.mockImplementation((sql: unknown) => {
      const text = String(sql);

      if (
        text.includes('SELECT * FROM research_targets') &&
        text.includes("kind = 'self'")
      ) {
        return mockRows([
          {
            id: 'self-target',
            tenant_id: 'tenant-1',
            kind: 'self',
            owner_id: 'owner-1',
            contact_id: null,
            company_id: null,
            label: 'Self',
            pinned: false,
            created_at: 'x',
            updated_at: 'x',
            last_used_at: 'x',
          },
        ]);
      }
      if (text.includes(`FROM tenants WHERE slug = 'default'`)) {
        return mockRows([{ id: 'tenant-1' }]);
      }
      if (text.includes('INSERT INTO research_target_state')) {
        return mockRows([
          {
            tenant_id: 'tenant-1',
            user_id: 'owner-1',
            primary_target_id: 'self-target',
            secondary_target_id: 'healthy-target',
            updated_at: 'x',
          },
        ]);
      }
      if (
        text.includes('SELECT owner_id, contact_id, company_id') &&
        text.includes('research_targets')
      ) {
        // Healthy — contact_id is set.
        return mockRows([
          { owner_id: null, contact_id: 'contact-abc', company_id: null },
        ]);
      }
      if (
        text.includes('UPDATE research_target_state') &&
        text.includes('secondary_target_id = NULL')
      ) {
        clearFired = true;
        return mockRows([]);
      }
      return mockRows([]);
    });

    const { getResearchTargetState } = await import('@/lib/targets/service');
    const state = await getResearchTargetState('owner-1');
    expect(state?.secondaryTargetId).toBe('healthy-target');
    expect(clearFired).toBe(false);
  });
});
