// Tests for emitter: synchronous INSERT + async dispatch.

jest.mock('@/lib/db/client', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  healthCheck: jest.fn(),
  getPool: jest.fn(),
  shutdown: jest.fn(),
}));

jest.mock('@/lib/ecc/impulses/dispatcher', () => ({
  dispatchImpulse: jest.fn().mockResolvedValue({ impulseId: 'x', handlersExecuted: 0, results: [] }),
}));

import { query } from '@/lib/db/client';
import { dispatchImpulse } from '@/lib/ecc/impulses/dispatcher';
import { emitImpulse, emitImpulses } from '@/lib/ecc/impulses/emitter';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockDispatch = dispatchImpulse as jest.MockedFunction<typeof dispatchImpulse>;

function mockRows<T>(rows: T[]): ReturnType<typeof query> {
  return Promise.resolve({ rows, command: '', rowCount: rows.length, oid: 0, fields: [] }) as ReturnType<typeof query>;
}

describe('emitImpulse', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockDispatch.mockReset();
    mockDispatch.mockResolvedValue({ impulseId: 'x', handlersExecuted: 0, results: [] });
  });

  it('inserts impulse row and returns a mapped Impulse', async () => {
    mockQuery.mockReturnValueOnce(mockRows([{
      id: 'imp-1', tenant_id: 'default', impulse_type: 'tier_changed',
      source_entity_type: 'contact', source_entity_id: 'c1',
      payload: { from: 'silver', to: 'gold' }, created_at: '2026-01-01',
    }]));

    const result = await emitImpulse('default', 'tier_changed', 'contact', 'c1', { from: 'silver', to: 'gold' });
    expect(result.id).toBe('imp-1');
    expect(result.impulseType).toBe('tier_changed');
    expect(result.payload).toEqual({ from: 'silver', to: 'gold' });

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toMatch(/INSERT INTO impulses/);
    const params = mockQuery.mock.calls[0][1] as unknown[];
    // payload is serialized as JSON string
    expect(params[4]).toBe(JSON.stringify({ from: 'silver', to: 'gold' }));

    // Dispatch is fire-and-forget but must be invoked with the impulse id.
    expect(mockDispatch).toHaveBeenCalledWith('imp-1');
  });

  it('does not reject when dispatch rejects (fire-and-forget)', async () => {
    mockQuery.mockReturnValueOnce(mockRows([{
      id: 'imp-2', tenant_id: 'default', impulse_type: 'score_computed',
      source_entity_type: 'contact', source_entity_id: 'c2',
      payload: {}, created_at: 'x',
    }]));
    mockDispatch.mockRejectedValueOnce(new Error('handler blew up'));
    // Silence the expected console.error from the caught dispatch rejection.
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await emitImpulse('default', 'score_computed', 'contact', 'c2', {});
    expect(result.id).toBe('imp-2');
    // Allow the queued rejection handler to flush.
    await new Promise<void>(resolve => setImmediate(resolve));

    errSpy.mockRestore();
  });
});

describe('emitImpulses (batch)', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockDispatch.mockReset();
    mockDispatch.mockResolvedValue({ impulseId: 'x', handlersExecuted: 0, results: [] });
  });

  it('returns empty array and skips DB when input is empty', async () => {
    const result = await emitImpulses([]);
    expect(result).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('inserts all impulses in one query and dispatches each', async () => {
    mockQuery.mockReturnValueOnce(mockRows([
      { id: 'a', tenant_id: 't', impulse_type: 'score_computed', source_entity_type: 'contact', source_entity_id: 'c1', payload: {}, created_at: 'x' },
      { id: 'b', tenant_id: 't', impulse_type: 'tier_changed', source_entity_type: 'contact', source_entity_id: 'c2', payload: {}, created_at: 'x' },
    ]));

    const result = await emitImpulses([
      { tenantId: 't', impulseType: 'score_computed', sourceEntityType: 'contact', sourceEntityId: 'c1', payload: {} },
      { tenantId: 't', impulseType: 'tier_changed', sourceEntityType: 'contact', sourceEntityId: 'c2', payload: {} },
    ]);

    expect(result).toHaveLength(2);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledTimes(2);
    expect(mockDispatch).toHaveBeenCalledWith('a');
    expect(mockDispatch).toHaveBeenCalledWith('b');
  });
});
