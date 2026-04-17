// POST /api/sources/cron/google-news-refresh
//
// Iterates every `source_subscriptions` row of kind='google_news' and runs
// the Google News RSS connector for the query string.
//
// Protected by the `X-Cron-Secret` header. Gated on RESEARCH_FLAGS.sources AND
// the per-connector RESEARCH_CONNECTOR_GOOGLE_NEWS flag.

import { NextRequest, NextResponse } from 'next/server';
import { RESEARCH_FLAGS } from '@/lib/config/research-flags';
import { isCronAuthorized } from '@/lib/sources/cron-auth';
import { getDefaultTenantId } from '@/lib/db/tenants';
import { query } from '@/lib/db/client';
import {
  googleNewsConnector,
  isGoogleNewsConnectorEnabled,
} from '@/lib/sources/connectors/google-news';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface SubRow {
  id: string;
  query: string;
  company_id: string | null;
  contact_id: string | null;
}

export async function POST(req: NextRequest) {
  if (!RESEARCH_FLAGS.sources) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  if (!isGoogleNewsConnectorEnabled()) {
    return NextResponse.json(
      { error: 'DISABLED', message: 'Google News connector disabled' },
      { status: 409 }
    );
  }

  const tenantId = await getDefaultTenantId();

  const subs = await query<SubRow>(
    `SELECT id, query, company_id, contact_id FROM source_subscriptions
     WHERE tenant_id = $1
       AND kind = 'google_news'
       AND query IS NOT NULL
       AND enabled = TRUE
     ORDER BY last_polled_at NULLS FIRST
     LIMIT 50`,
    [tenantId]
  );

  const results: Array<{
    subscriptionId: string;
    query: string;
    ok: boolean;
    summary: string;
    error?: string;
  }> = [];

  for (const row of subs.rows) {
    try {
      const result = await googleNewsConnector.invoke(
        {
          targetName: row.query,
          companyId: row.company_id ?? undefined,
          contactId: row.contact_id ?? undefined,
        },
        { tenantId, userId: null, targetId: null }
      );
      await query(
        `UPDATE source_subscriptions
         SET last_polled_at = NOW(), last_error = NULL
         WHERE id = $1`,
        [row.id]
      );
      results.push({
        subscriptionId: row.id,
        query: row.query,
        ok: true,
        summary: result.summary,
      });
    } catch (err) {
      const message = (err as Error).message;
      await query(
        `UPDATE source_subscriptions
         SET last_polled_at = NOW(), last_error = $2
         WHERE id = $1`,
        [row.id, message]
      );
      results.push({
        subscriptionId: row.id,
        query: row.query,
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
