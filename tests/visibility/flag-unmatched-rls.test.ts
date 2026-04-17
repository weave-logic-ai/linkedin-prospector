// WS-2 Phase 2 Track D — parser_selector_flags migration + flag-unmatched
// endpoint shape. Validates migration 039 (schema + RLS) and that the POST
// route rejects bad inputs before touching the DB.

import fs from 'fs';
import path from 'path';

jest.mock('@/lib/db/client', () => ({
  query: jest.fn(),
}));
jest.mock('@/lib/config/research-flags', () => ({
  RESEARCH_FLAGS: { parserTelemetry: true, snippets: false, targets: false, sources: false },
}));

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../data/db/init/039-parser-selector-flags.sql',
);

describe('migration 039 — parser_selector_flags', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');

  it('creates the table with a 4KB excerpt cap', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS parser_selector_flags/);
    expect(sql).toMatch(/CONSTRAINT chk_excerpt_size CHECK \(octet_length\(dom_html_excerpt\) <= 4096\)/);
  });

  it('enables RLS with tenant_isolation + admin_bypass policies', () => {
    expect(sql).toMatch(/ALTER TABLE parser_selector_flags ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(
      /CREATE POLICY tenant_isolation_parser_selector_flags ON parser_selector_flags\s+FOR ALL USING \(tenant_id = get_current_tenant_id\(\)\)/,
    );
    expect(sql).toMatch(
      /CREATE POLICY admin_bypass_parser_selector_flags ON parser_selector_flags\s+FOR ALL USING \(is_super_admin\(\)\)/,
    );
  });

  it('has capture_id ON DELETE CASCADE from page_cache', () => {
    expect(sql).toMatch(/capture_id\s+UUID NOT NULL REFERENCES page_cache\(id\) ON DELETE CASCADE/);
  });
});

describe('POST /api/parser/flag-unmatched — validation', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  function buildRequest(body: unknown): import('next/server').NextRequest {
    // Minimal NextRequest stand-in: we only call .json().
    return {
      json: async () => body,
    } as unknown as import('next/server').NextRequest;
  }

  it('rejects non-UUID captureId with 400', async () => {
    const route = await import('@/app/api/parser/flag-unmatched/route');
    const res = await route.POST(
      buildRequest({
        captureId: 'not-a-uuid',
        pageType: 'PROFILE',
        domPath: 'main > section',
        domHtmlExcerpt: '<div/>',
      }),
    );
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(String(j.error)).toMatch(/captureId/);
  });

  it('rejects missing domHtmlExcerpt with 400', async () => {
    const route = await import('@/app/api/parser/flag-unmatched/route');
    const res = await route.POST(
      buildRequest({
        captureId: '11111111-1111-1111-1111-111111111111',
        pageType: 'PROFILE',
        domPath: 'main > section',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('truncates a 10KB excerpt to 4KB before insert', async () => {
    const { query } = await import('@/lib/db/client');
    const mockQuery = query as jest.MockedFunction<typeof query>;
    // First call: tenant lookup.
    mockQuery.mockResolvedValueOnce({
      rows: [{ tid: '00000000-0000-0000-0000-0000000000aa' }],
    } as unknown as Awaited<ReturnType<typeof query>>);
    // Second call: insert.
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: '22222222-2222-2222-2222-222222222222' }],
    } as unknown as Awaited<ReturnType<typeof query>>);
    // Third call: analytics events writer tenant lookup.
    mockQuery.mockResolvedValueOnce({
      rows: [{ tid: '00000000-0000-0000-0000-0000000000aa' }],
    } as unknown as Awaited<ReturnType<typeof query>>);
    // Fourth call: analytics insert.
    mockQuery.mockResolvedValueOnce({ rows: [] } as unknown as Awaited<
      ReturnType<typeof query>
    >);

    const route = await import('@/app/api/parser/flag-unmatched/route');
    const bigExcerpt = 'x'.repeat(10 * 1024);
    const res = await route.POST(
      buildRequest({
        captureId: '11111111-1111-1111-1111-111111111111',
        pageType: 'PROFILE',
        domPath: 'main > section',
        domHtmlExcerpt: bigExcerpt,
      }),
    );
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.stored).toBe(true);

    // Verify the insert received a truncated excerpt (≤ 4096 bytes).
    const insertCall = mockQuery.mock.calls[1] as [string, unknown[]];
    const insertParams = insertCall[1];
    const excerpt = insertParams[4] as string;
    expect(Buffer.byteLength(excerpt, 'utf-8')).toBeLessThanOrEqual(4096);
  });
});
