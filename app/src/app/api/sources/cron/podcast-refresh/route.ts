// POST /api/sources/cron/podcast-refresh
//
// For each subscribed podcast RSS feed (`source_feeds` with
// `source_type='podcast'`), invoke the podcast connector. New episodes are
// deduped by (tenant_id, 'podcast', '<feed_url>::<guid>') via
// writeSourceRecord.
//
// Protected by `X-Cron-Secret`. Gated on RESEARCH_FLAGS.sources +
// RESEARCH_FLAGS.connectorPodcast.

import { NextRequest, NextResponse } from 'next/server';
import { RESEARCH_FLAGS } from '@/lib/config/research-flags';
import { isCronAuthorized } from '@/lib/sources/cron-auth';
import { getDefaultTenantId } from '@/lib/db/tenants';
import { query } from '@/lib/db/client';
import { podcastConnector } from '@/lib/sources/connectors/podcast';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface FeedRow {
  id: string;
  feed_url: string;
  label: string | null;
}

export async function POST(req: NextRequest) {
  if (!RESEARCH_FLAGS.sources || !RESEARCH_FLAGS.connectorPodcast) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const tenantId = await getDefaultTenantId();

  const feeds = await query<FeedRow>(
    `SELECT id, feed_url, label
     FROM source_feeds
     WHERE tenant_id = $1 AND source_type = 'podcast'
     ORDER BY COALESCE(last_fetched_at, 'epoch'::timestamptz) ASC
     LIMIT 50`,
    [tenantId]
  );

  const results: Array<{
    feedId: string;
    feedUrl: string;
    ok: boolean;
    summary: string;
    error?: string;
  }> = [];

  for (const row of feeds.rows) {
    try {
      const result = await podcastConnector.invoke(
        { feedUrl: row.feed_url },
        { tenantId, userId: null, targetId: null }
      );
      await query(
        `UPDATE source_feeds
           SET last_fetched_at = NOW(),
               last_success_at = NOW()
         WHERE id = $1`,
        [row.id]
      );
      results.push({
        feedId: row.id,
        feedUrl: row.feed_url,
        ok: true,
        summary: result.summary,
      });
    } catch (err) {
      await query(
        `UPDATE source_feeds SET last_fetched_at = NOW() WHERE id = $1`,
        [row.id]
      );
      results.push({
        feedId: row.id,
        feedUrl: row.feed_url,
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
