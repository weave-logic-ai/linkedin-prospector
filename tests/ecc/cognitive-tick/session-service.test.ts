// Research session CRUD tests

jest.mock('@/lib/db/client', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  healthCheck: jest.fn(),
  getPool: jest.fn(),
  shutdown: jest.fn(),
}));

import { query } from '@/lib/db/client';
import * as sessionService from '@/lib/ecc/cognitive-tick/session-service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function mockRows<T>(rows: T[]): ReturnType<typeof query> {
  return Promise.resolve({ rows, command: '', rowCount: rows.length, oid: 0, fields: [] }) as ReturnType<typeof query>;
}

function sessionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'sess-1', tenant_id: 't', user_id: 'u1',
    intent: { goal: 'analyze' }, context: {},
    status: 'active', created_at: 'x', updated_at: 'x',
    ...overrides,
  };
}

describe('Session service CRUD', () => {
  beforeEach(() => mockQuery.mockReset());

  describe('createSession', () => {
    it('inserts with intent serialized as JSON', async () => {
      mockQuery.mockReturnValueOnce(mockRows([sessionRow({ intent: { goal: 'analyze', icpFocus: ['ctos'] } })]));
      const session = await sessionService.createSession('t', 'u1', { goal: 'analyze', icpFocus: ['ctos'] });
      expect(session.id).toBe('sess-1');
      expect(session.status).toBe('active');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[2]).toBe(JSON.stringify({ goal: 'analyze', icpFocus: ['ctos'] }));
    });
  });

  describe('getSession', () => {
    it('returns null when session not found', async () => {
      mockQuery.mockReturnValueOnce(mockRows([]));
      expect(await sessionService.getSession('missing')).toBeNull();
    });
    it('returns mapped session when found', async () => {
      mockQuery.mockReturnValueOnce(mockRows([sessionRow()]));
      const session = await sessionService.getSession('sess-1');
      expect(session?.id).toBe('sess-1');
      expect(session?.status).toBe('active');
    });
  });

  describe('getActiveSessionForUser', () => {
    it('returns the most recently updated active session', async () => {
      mockQuery.mockReturnValueOnce(mockRows([sessionRow()]));
      const session = await sessionService.getActiveSessionForUser('t', 'u1');
      expect(session?.id).toBe('sess-1');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/status = 'active'/);
      expect(sql).toMatch(/ORDER BY updated_at DESC/);
    });
  });

  describe('updateSessionContext', () => {
    it('merges context via jsonb concatenation', async () => {
      mockQuery.mockReturnValueOnce(mockRows([]));
      await sessionService.updateSessionContext('sess-1', { foo: 'bar' });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/context = context \|\| \$1::jsonb/);
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe(JSON.stringify({ foo: 'bar' }));
    });
  });

  describe('updateSessionIntent', () => {
    it('merges intent partial via jsonb concatenation', async () => {
      mockQuery.mockReturnValueOnce(mockRows([]));
      await sessionService.updateSessionIntent('sess-1', { verticals: ['Technology'] });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/intent = intent \|\| \$1::jsonb/);
    });
  });

  describe('pauseSession / resumeSession / completeSession', () => {
    it('pauseSession sets status=paused', async () => {
      mockQuery.mockReturnValueOnce(mockRows([]));
      await sessionService.pauseSession('sess-1');
      expect(mockQuery.mock.calls[0][0]).toMatch(/status = 'paused'/);
    });
    it('resumeSession returns the updated session', async () => {
      mockQuery.mockReturnValueOnce(mockRows([sessionRow({ status: 'active' })]));
      const session = await sessionService.resumeSession('sess-1');
      expect(session?.status).toBe('active');
    });
    it('completeSession sets status=completed', async () => {
      mockQuery.mockReturnValueOnce(mockRows([]));
      await sessionService.completeSession('sess-1');
      expect(mockQuery.mock.calls[0][0]).toMatch(/status = 'completed'/);
    });
  });

  describe('session messages', () => {
    it('addSessionMessage serializes context snapshot as JSON', async () => {
      mockQuery.mockReturnValueOnce(mockRows([{
        id: 'msg-1', session_id: 'sess-1', role: 'user', content: 'hello',
        context_snapshot: { x: 1 }, tokens_used: 0, created_at: 'x',
      }]));
      const msg = await sessionService.addSessionMessage('sess-1', 'user', 'hello', { x: 1 });
      expect(msg.role).toBe('user');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[3]).toBe(JSON.stringify({ x: 1 }));
    });

    it('getSessionMessages returns chronological order (reverses DESC fetch)', async () => {
      // DB returns DESC by created_at; service reverses to chronological.
      mockQuery.mockReturnValueOnce(mockRows([
        { id: '2', session_id: 's', role: 'assistant', content: 'reply',
          context_snapshot: {}, tokens_used: 0, created_at: '2026-01-02' },
        { id: '1', session_id: 's', role: 'user', content: 'hi',
          context_snapshot: {}, tokens_used: 0, created_at: '2026-01-01' },
      ]));
      const msgs = await sessionService.getSessionMessages('s', 10);
      expect(msgs.map(m => m.id)).toEqual(['1', '2']);
    });
  });

  describe('pauseInactiveSessions', () => {
    it('returns the number of paused sessions', async () => {
      mockQuery.mockReturnValueOnce(mockRows([{ id: 'a' }, { id: 'b' }, { id: 'c' }]));
      const n = await sessionService.pauseInactiveSessions(30);
      expect(n).toBe(3);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/INTERVAL/);
      expect(sql).toMatch(/status = 'paused'/);
    });
  });
});
