// Research Tools Sprint — WS-4 Phase 4 Track H: history ring-buffer tests.
//
// Exercises `applyHistoryEntry` (pure) for cap + de-dupe semantics, and
// `pushTargetHistory` / `readTargetHistory` against a mocked pg client.

jest.mock('@/lib/db/client', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  healthCheck: jest.fn(),
  getPool: jest.fn(),
  shutdown: jest.fn(),
}));

jest.mock('@/lib/targets/service', () => ({
  getResearchTargetState: jest.fn(),
}));

function mockRows<T>(rows: T[]) {
  return Promise.resolve({
    rows,
    command: '',
    rowCount: rows.length,
    oid: 0,
    fields: [],
  });
}

describe('targets/history-service', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('applyHistoryEntry caps the buffer at HISTORY_LIMIT (20)', async () => {
    const { applyHistoryEntry, HISTORY_LIMIT } = await import(
      '@/lib/targets/history-service'
    );
    // Seed 25 unique entries (oldest at tail).
    let buf: ReturnType<typeof applyHistoryEntry> = [];
    for (let i = 0; i < 25; i++) {
      buf = applyHistoryEntry(buf, {
        targetId: `t-${i}`,
        lensId: null,
        openedAt: new Date(1_700_000_000_000 + i).toISOString(),
      });
    }
    expect(buf).toHaveLength(HISTORY_LIMIT);
    // Newest at index 0, oldest remaining is t-5 (t-0..t-4 fell off).
    expect(buf[0].targetId).toBe('t-24');
    expect(buf[HISTORY_LIMIT - 1].targetId).toBe('t-5');
  });

  it('applyHistoryEntry de-dupes consecutive same-targetId entries', async () => {
    const { applyHistoryEntry } = await import('@/lib/targets/history-service');
    let buf = applyHistoryEntry([], {
      targetId: 't-1',
      lensId: 'lens-a',
      openedAt: '2026-04-17T00:00:00.000Z',
    });
    // Same target, newer lens / time — should refresh head rather than push.
    buf = applyHistoryEntry(buf, {
      targetId: 't-1',
      lensId: 'lens-b',
      openedAt: '2026-04-17T00:01:00.000Z',
    });
    expect(buf).toHaveLength(1);
    expect(buf[0].lensId).toBe('lens-b');
    expect(buf[0].openedAt).toBe('2026-04-17T00:01:00.000Z');

    // Different target does push.
    buf = applyHistoryEntry(buf, {
      targetId: 't-2',
      lensId: null,
      openedAt: '2026-04-17T00:02:00.000Z',
    });
    expect(buf).toHaveLength(2);
    expect(buf[0].targetId).toBe('t-2');
    expect(buf[1].targetId).toBe('t-1');
  });

  it('pushTargetHistory updates the JSONB column with the capped buffer', async () => {
    const { query } = await import('@/lib/db/client');
    const { getResearchTargetState } = await import('@/lib/targets/service');
    (getResearchTargetState as jest.Mock).mockResolvedValue({
      tenantId: 'tenant-1',
      userId: 'owner-1',
      primaryTargetId: 'self-1',
      secondaryTargetId: null,
      updatedAt: 'x',
    });

    const updateCalls: Array<{ sql: string; params: unknown[] }> = [];
    (query as jest.MockedFunction<typeof query>).mockImplementation(
      (sql: unknown, params?: unknown[]) => {
        const text = String(sql);
        if (text.includes('SELECT history FROM research_target_state')) {
          return mockRows<Record<string, unknown>>([
            { history: [{ targetId: 't-old', lensId: null, openedAt: 'x' }] },
          ]) as ReturnType<typeof query>;
        }
        if (text.includes('UPDATE research_target_state')) {
          updateCalls.push({ sql: text, params: params ?? [] });
          return mockRows<Record<string, unknown>>([]) as ReturnType<typeof query>;
        }
        return mockRows<Record<string, unknown>>([]) as ReturnType<typeof query>;
      }
    );

    const svc = await import('@/lib/targets/history-service');
    const result = await svc.pushTargetHistory('owner-1', {
      targetId: 't-new',
      lensId: 'lens-1',
      openedAt: '2026-04-17T12:00:00.000Z',
    });

    expect(result[0].targetId).toBe('t-new');
    expect(result).toHaveLength(2);
    expect(updateCalls).toHaveLength(1);
    const storedJson = updateCalls[0].params[2] as string;
    const stored = JSON.parse(storedJson) as Array<Record<string, unknown>>;
    expect(stored[0].targetId).toBe('t-new');
    expect(stored[0].lensId).toBe('lens-1');
  });

  it('readTargetHistory returns [] when state row has no history column data', async () => {
    const { query } = await import('@/lib/db/client');
    const { getResearchTargetState } = await import('@/lib/targets/service');
    (getResearchTargetState as jest.Mock).mockResolvedValue({
      tenantId: 'tenant-1',
      userId: 'owner-1',
      primaryTargetId: 'self-1',
      secondaryTargetId: null,
      updatedAt: 'x',
    });
    (query as jest.MockedFunction<typeof query>).mockImplementation(() =>
      mockRows<Record<string, unknown>>([{ history: null }]) as ReturnType<typeof query>
    );

    const svc = await import('@/lib/targets/history-service');
    const history = await svc.readTargetHistory('owner-1', 5);
    expect(history).toEqual([]);
  });

  it('readTargetHistory filters malformed entries out of the buffer', async () => {
    const { query } = await import('@/lib/db/client');
    const { getResearchTargetState } = await import('@/lib/targets/service');
    (getResearchTargetState as jest.Mock).mockResolvedValue({
      tenantId: 't',
      userId: 'o',
      primaryTargetId: 's',
      secondaryTargetId: null,
      updatedAt: 'x',
    });
    (query as jest.MockedFunction<typeof query>).mockImplementation(() =>
      mockRows<Record<string, unknown>>([
        {
          history: [
            { targetId: 'valid-1', lensId: null, openedAt: 'x' },
            { targetId: 'valid-2', openedAt: 'x' },
            { targetId: '', openedAt: 'x' }, // invalid — empty id
            null, // invalid — not an object
            { lensId: 'only-lens' }, // invalid — no targetId
            { targetId: 'valid-3', lensId: 'lens', openedAt: 'y' },
          ],
        },
      ]) as ReturnType<typeof query>
    );

    const svc = await import('@/lib/targets/history-service');
    const history = await svc.readTargetHistory('o', 10);
    expect(history.map((e) => e.targetId)).toEqual(['valid-1', 'valid-2', 'valid-3']);
  });
});
