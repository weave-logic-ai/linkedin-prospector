// POST /api/sources/cron/blog-discovery
//
// For each `companies.domain` not yet marked `blog_discovered`, run the
// corporate-blog discovery chain (RSS probe → sitemap fallback). The
// connector itself sets `blog_discovered=TRUE` once it has answered (positive
// or negative) so each company is attempted at most once per schema reset.
//
// Protected by the `X-Cron-Secret` header. Gated on RESEARCH_FLAGS.sources AND
// the per-connector RESEARCH_CONNECTOR_BLOG flag.

import { NextRequest, NextResponse } from 'next/server';
import { RESEARCH_FLAGS } from '@/lib/config/research-flags';
import { isCronAuthorized } from '@/lib/sources/cron-auth';
import { getDefaultTenantId } from '@/lib/db/tenants';
import { query } from '@/lib/db/client';
import {
  corporateBlogConnector,
  isBlogConnectorEnabled,
} from '@/lib/sources/connectors/corporate-blog';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface CompanyRow {
  id: string;
  name: string;
  domain: string | null;
}

export async function POST(req: NextRequest) {
  if (!RESEARCH_FLAGS.sources) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  if (!isBlogConnectorEnabled()) {
    return NextResponse.json(
      { error: 'DISABLED', message: 'Blog connector disabled' },
      { status: 409 }
    );
  }

  const tenantId = await getDefaultTenantId();

  const companies = await query<CompanyRow>(
    `SELECT id, name, domain FROM companies
     WHERE blog_discovered = FALSE
       AND domain IS NOT NULL
       AND TRIM(domain) <> ''
     ORDER BY updated_at DESC
     LIMIT 25`
  );

  const results: Array<{
    companyId: string;
    domain: string | null;
    ok: boolean;
    summary: string;
    error?: string;
  }> = [];

  for (const row of companies.rows) {
    if (!row.domain) continue;
    try {
      const result = await corporateBlogConnector.invoke(
        { domain: row.domain, companyId: row.id },
        { tenantId, userId: null, targetId: null }
      );
      results.push({
        companyId: row.id,
        domain: row.domain,
        ok: true,
        summary: result.summary,
      });
    } catch (err) {
      const message = (err as Error).message;
      results.push({
        companyId: row.id,
        domain: row.domain,
        ok: false,
        summary: 'failed',
        error: message,
      });
    }
  }

  return NextResponse.json({
    success: true,
    processed: results.length,
    results,
  });
}
