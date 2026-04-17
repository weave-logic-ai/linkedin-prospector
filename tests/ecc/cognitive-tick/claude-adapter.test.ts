// Claude adapter tests: session context building + intent shift detection.

jest.mock('@/lib/db/client', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  healthCheck: jest.fn(),
  getPool: jest.fn(),
  shutdown: jest.fn(),
}));

jest.mock('@/lib/claude/client', () => ({
  claudeChat: jest.fn(),
}));

import { detectIntentShift } from '@/lib/ecc/cognitive-tick/claude-adapter';

describe('detectIntentShift', () => {
  it('detects a vertical shift via "switch to" keyword', () => {
    const shift = detectIntentShift(
      { goal: 'analyze', verticals: ['Technology'] },
      'Please switch to Healthcare now.'
    );
    expect(shift).not.toBeNull();
    expect(shift!.type).toBe('vertical_shift');
    expect(shift!.from).toEqual(['Technology']);
  });

  it('detects a vertical shift via "focus on" keyword', () => {
    const shift = detectIntentShift(
      { goal: 'analyze' },
      'Let\'s focus on FinTech for a while.'
    );
    expect(shift).not.toBeNull();
    expect(shift!.type).toBe('vertical_shift');
  });

  it('detects ICP shift when new ICP keyword appears', () => {
    const shift = detectIntentShift(
      { goal: 'analyze', icpFocus: ['cfos'] },
      'Show me engineers at growth companies.'
    );
    expect(shift).not.toBeNull();
    expect(shift!.type).toBe('icp_shift');
    expect(shift!.to).toEqual(['engineers']);
  });

  it('returns null when no shift keywords are present', () => {
    const shift = detectIntentShift(
      { goal: 'analyze', icpFocus: ['ctos'] },
      'Tell me about this contact.'
    );
    expect(shift).toBeNull();
  });

  it('does not flag an ICP shift when the keyword matches current focus', () => {
    const shift = detectIntentShift(
      { goal: 'analyze', icpFocus: ['ctos'] },
      'Tell me more about ctos.'
    );
    expect(shift).toBeNull();
  });
});

describe('analyzeWithSession', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('performs stateless analysis when ECC_COGNITIVE_TICK is off', async () => {
    delete process.env.ECC_COGNITIVE_TICK;
    const claudeModule = await import('@/lib/claude/client');
    (claudeModule.claudeChat as jest.Mock).mockResolvedValueOnce('stateless response');

    const { analyzeWithSession } = await import('@/lib/ecc/cognitive-tick/claude-adapter');
    const result = await analyzeWithSession('t', 'u1', 'c1', 'Tell me', 'Contact summary');

    expect(result.sessionId).toBeNull();
    expect(result.response).toBe('stateless response');
    expect(claudeModule.claudeChat).toHaveBeenCalledTimes(1);
  });

  it('creates a session and persists messages when ECC_COGNITIVE_TICK is on', async () => {
    process.env.ECC_COGNITIVE_TICK = 'true';

    const dbModule = await import('@/lib/db/client');
    const claudeModule = await import('@/lib/claude/client');
    (claudeModule.claudeChat as jest.Mock).mockResolvedValue('session-aware response');

    const mockQuery = dbModule.query as jest.MockedFunction<typeof dbModule.query>;

    // Simulate:
    // 1) createSession -> INSERT research_sessions returns row
    // 2) getSessionMessages -> returns empty
    // 3) addSessionMessage (user) -> insert
    // 4) addSessionMessage (assistant) -> insert
    // 5) updateSessionContext -> update
    mockQuery.mockImplementation((sql: unknown) => {
      const text = String(sql);
      if (text.includes('INSERT INTO research_sessions')) {
        return Promise.resolve({
          rows: [{
            id: 'sess-new', tenant_id: 't', user_id: 'u1',
            intent: { goal: 'analyze' }, context: {},
            status: 'active', created_at: 'x', updated_at: 'x',
          }],
          command: '', rowCount: 1, oid: 0, fields: [],
        }) as unknown as ReturnType<typeof dbModule.query>;
      }
      if (text.includes('SELECT * FROM session_messages')) {
        return Promise.resolve({ rows: [], command: '', rowCount: 0, oid: 0, fields: [] }) as unknown as ReturnType<typeof dbModule.query>;
      }
      if (text.includes('INSERT INTO session_messages')) {
        return Promise.resolve({
          rows: [{ id: 'm', session_id: 'sess-new', role: 'user', content: '', context_snapshot: {}, tokens_used: 0, created_at: 'x' }],
          command: '', rowCount: 1, oid: 0, fields: [],
        }) as unknown as ReturnType<typeof dbModule.query>;
      }
      return Promise.resolve({ rows: [], command: '', rowCount: 0, oid: 0, fields: [] }) as unknown as ReturnType<typeof dbModule.query>;
    });

    const { analyzeWithSession } = await import('@/lib/ecc/cognitive-tick/claude-adapter');
    const result = await analyzeWithSession('t', 'u1', 'contact-1', 'What do you think?', 'Some contact');

    expect(result.sessionId).toBe('sess-new');
    expect(result.response).toBe('session-aware response');

    // User + assistant message inserts
    const messageInserts = mockQuery.mock.calls.filter(c => String(c[0]).includes('INSERT INTO session_messages'));
    expect(messageInserts.length).toBe(2);

    // Context update
    const ctxUpdates = mockQuery.mock.calls.filter(c => String(c[0]).includes('UPDATE research_sessions'));
    expect(ctxUpdates.length).toBeGreaterThanOrEqual(1);
  });
});
