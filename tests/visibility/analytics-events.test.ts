// WS-2 Phase 2 Track D — analytics event shape + flag gating.
// Verifies migration 040 shape (event name regex, RLS) and the runtime
// behavior of the recordEvent helper.

import fs from 'fs';
import path from 'path';

jest.mock('@/lib/db/client', () => ({
  query: jest.fn(),
}));

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../data/db/init/040-analytics-events.sql',
);

describe('migration 040 — analytics_events shape', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');

  it('creates analytics_events with a snake_case CHECK on event', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS analytics_events/);
    expect(sql).toMatch(/event\s+TEXT NOT NULL CHECK \(event ~ '\^\[a-z\]\[a-z0-9_\]\*\$'\)/);
  });

  it('enables RLS and defines tenant_isolation + admin_bypass policies', () => {
    expect(sql).toMatch(/ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(
      /CREATE POLICY tenant_isolation_analytics_events ON analytics_events\s+FOR ALL USING \(tenant_id = get_current_tenant_id\(\)\)/,
    );
    expect(sql).toMatch(
      /CREATE POLICY admin_bypass_analytics_events ON analytics_events\s+FOR ALL USING \(is_super_admin\(\)\)/,
    );
  });
});

describe('recordEvent — flag gating and shape', () => {
  const PREV_FLAG = process.env.RESEARCH_PARSER_TELEMETRY;

  afterEach(() => {
    process.env.RESEARCH_PARSER_TELEMETRY = PREV_FLAG;
    jest.resetModules();
  });

  it('is a no-op when RESEARCH_PARSER_TELEMETRY is off', async () => {
    process.env.RESEARCH_PARSER_TELEMETRY = 'false';
    jest.resetModules();
    const mod = await import('@/lib/analytics/events');
    const res = await mod.recordEvent({ event: 'parse_panel_viewed' });
    expect(res.attempted).toBe(false);
    expect(res.written).toBe(false);
    expect(res.reason).toBe('flag-off');
  });

  it('rejects event names that violate the snake_case rule', async () => {
    process.env.RESEARCH_PARSER_TELEMETRY = 'true';
    jest.resetModules();
    const mod = await import('@/lib/analytics/events');
    const res = await mod.recordEvent({ event: 'Bad-Event' });
    expect(res.attempted).toBe(false);
    expect(res.reason).toBe('invalid-event');
  });

  it('writes an insert when flag is on and DB resolves a tenant', async () => {
    process.env.RESEARCH_PARSER_TELEMETRY = 'true';
    jest.resetModules();
    const { query } = await import('@/lib/db/client');
    const mockQuery = query as jest.MockedFunction<typeof query>;
    // First call resolves tenant; second call is the INSERT.
    mockQuery.mockResolvedValueOnce({
      rows: [{ tid: '00000000-0000-0000-0000-0000000000aa' }],
    } as unknown as Awaited<ReturnType<typeof query>>);
    mockQuery.mockResolvedValueOnce({ rows: [] } as unknown as Awaited<
      ReturnType<typeof query>
    >);

    const mod = await import('@/lib/analytics/events');
    const res = await mod.recordEvent({
      event: 'capture_diff_opened',
      properties: { kind: 'contact' },
    });
    expect(res.written).toBe(true);
    // Second call is the insert — verify event name and properties.
    const [insertSql, insertParams] = mockQuery.mock.calls[1] as [
      string,
      unknown[],
    ];
    expect(insertSql).toMatch(/INSERT INTO analytics_events/);
    expect(insertParams[2]).toBe('capture_diff_opened');
    const propsRaw = insertParams[3] as string;
    expect(JSON.parse(propsRaw)).toEqual({ kind: 'contact' });
  });
});
