// POST /api/sources/cron/rss-poll
//
// Polls every enabled RSS subscription for the default tenant. Idempotent by
// virtue of writeSourceRecord() dedup on (tenant_id, source_type, source_id).
//
// Protected by the `X-Cron-Secret` header. Gated on RESEARCH_FLAGS.sources AND
// the per-connector RESEARCH_CONNECTOR_RSS flag.

import { NextRequest, NextResponse } from 'next/server';
import { RESEARCH_FLAGS } from '@/lib/config/research-flags';
import { isCronAuthorized } from '@/lib/sources/cron-auth';
import { getDefaultTenantId } from '@/lib/db/tenants';
import { query } from '@/lib/db/client';
import {
  rssConnector,
  isRssConnectorEnabled,
} from '@/lib/sources/connectors/rss';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface SubRow {
  id: string;
  feed_url: string;
}

export async function POST(req: NextRequest) {
  if (!RESEARCH_FLAGS.sources) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  if (!isRssConnectorEnabled()) {
    return NextResponse.json(
      { error: 'DISABLED', message: 'RSS connector disabled' },
      { status: 409 }
    );
  }

  const tenantId = await getDefaultTenantId();

  const subs = await query<SubRow>(
    `SELECT id, feed_url FROM source_subscriptions
     WHERE tenant_id = $1
       AND kind = 'rss'
       AND feed_url IS NOT NULL
       AND enabled = TRUE
     ORDER BY last_polled_at NULLS FIRST
     LIMIT 100`,
    [tenantId]
  );

  const results: Array<{
    subscriptionId: string;
    feedUrl: string;
    ok: boolean;
    summary: string;
    error?: string;
  }> = [];

  for (const row of subs.rows) {
    try {
      const result = await rssConnector.invoke(
        { feedUrl: row.feed_url },
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
        feedUrl: row.feed_url,
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
        feedUrl: row.feed_url,
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
