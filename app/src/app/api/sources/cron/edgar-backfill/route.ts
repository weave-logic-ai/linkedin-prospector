// POST /api/sources/cron/edgar-backfill
//
// For each company with a non-null `cik`, pull up to 3 recent 10-K filings.
// Dedup on accession number — re-invocations are safe.
//
// Protected by the `X-Cron-Secret` header. Gated on RESEARCH_FLAGS.sources.

import { NextRequest, NextResponse } from 'next/server';
import { RESEARCH_FLAGS } from '@/lib/config/research-flags';
import { isCronAuthorized } from '@/lib/sources/cron-auth';
import { getDefaultTenantId } from '@/lib/db/tenants';
import { query } from '@/lib/db/client';
import { edgarConnector } from '@/lib/sources/connectors/edgar';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface CompanyRow {
  id: string;
  name: string;
  cik: string | null;
}

export async function POST(req: NextRequest) {
  if (!RESEARCH_FLAGS.sources) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const tenantId = await getDefaultTenantId();

  const companies = await query<CompanyRow>(
    `SELECT id, name, cik FROM companies
     WHERE cik IS NOT NULL
     ORDER BY updated_at DESC
     LIMIT 50`
  );

  const results: Array<{
    companyId: string;
    cik: string;
    ok: boolean;
    summary: string;
    error?: string;
  }> = [];

  for (const row of companies.rows) {
    if (!row.cik) continue;
    try {
      const result = await edgarConnector.invoke(
        { cik: row.cik, companyId: row.id, limit: 3 },
        { tenantId, userId: null, targetId: null }
      );
      results.push({
        companyId: row.id,
        cik: row.cik,
        ok: true,
        summary: result.summary,
      });
    } catch (err) {
      results.push({
        companyId: row.id,
        cik: row.cik,
        ok: false,
        summary: 'failed',
        error: (err as Error).message,
      });
    }
  }

  return NextResponse.json({
    success: true,
    processed: results.length,
    results,
  });
}
