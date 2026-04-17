// POST /api/sources/cron/news-sweep
//
// For each research_target (contact or company) and each enabled per-site
// news connector (WSJ / Bloomberg / Reuters / TechCrunch / CNBC), invoke
// the connector. Writes one source_records row per article (or one
// paywalled stub row for WSJ / Bloomberg walls). Idempotent via
// writeSourceRecord dedup.
//
// Protected by `X-Cron-Secret`. Gated on RESEARCH_FLAGS.sources +
// RESEARCH_FLAGS.connectorNews.

import { NextRequest, NextResponse } from 'next/server';
import {
  RESEARCH_FLAGS,
  isNewsSiteEnabled,
} from '@/lib/config/research-flags';
import { isCronAuthorized } from '@/lib/sources/cron-auth';
import { getDefaultTenantId } from '@/lib/db/tenants';
import { query } from '@/lib/db/client';
import { NEWS_CONNECTORS } from '@/lib/sources/registry';
import type { NewsConnectorInput, NewsOrigin } from '@/lib/sources/connectors/news/shared';
import type { SourceConnector } from '@/lib/sources/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface TargetRow {
  id: string;
  kind: string;
  contact_id: string | null;
  company_id: string | null;
  contact_name: string | null;
  company_name: string | null;
  company_domain: string | null;
}

const ORIGINS: NewsOrigin[] = ['wsj', 'bloomberg', 'reuters', 'techcrunch', 'cnbc'];

export async function POST(req: NextRequest) {
  if (!RESEARCH_FLAGS.sources || !RESEARCH_FLAGS.connectorNews) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const tenantId = await getDefaultTenantId();

  const targets = await query<TargetRow>(
    `SELECT rt.id, rt.kind, rt.contact_id, rt.company_id,
            c.name AS contact_name,
            co.name AS company_name,
            co.website AS company_domain
     FROM research_targets rt
     LEFT JOIN contacts c ON c.id = rt.contact_id
     LEFT JOIN companies co ON co.id = rt.company_id
     WHERE rt.tenant_id = $1 AND rt.kind IN ('contact', 'company')
     ORDER BY rt.last_used_at DESC
     LIMIT 25`,
    [tenantId]
  );

  const results: Array<{
    targetId: string;
    origin: NewsOrigin;
    ok: boolean;
    summary: string;
    error?: string;
  }> = [];

  for (const row of targets.rows) {
    const entity = buildEntity(row);
    if (!entity) {
      continue;
    }
    for (const origin of ORIGINS) {
      if (!isNewsSiteEnabled(origin)) continue;
      const connector = NEWS_CONNECTORS[origin] as SourceConnector<NewsConnectorInput>;
      try {
        const result = await connector.invoke(
          { entity },
          { tenantId, userId: null, targetId: row.id }
        );
        results.push({
          targetId: row.id,
          origin,
          ok: true,
          summary: result.summary,
        });
      } catch (err) {
        results.push({
          targetId: row.id,
          origin,
          ok: false,
          summary: 'failed',
          error: (err as Error).message,
        });
      }
    }
  }

  return NextResponse.json({
    success: true,
    processed: results.length,
    results,
  });
}

function buildEntity(
  row: TargetRow
): { kind: 'person' | 'company'; name: string; domain?: string } | null {
  if (row.kind === 'contact' && row.contact_name) {
    return { kind: 'person', name: row.contact_name };
  }
  if (row.kind === 'company' && row.company_name) {
    return {
      kind: 'company',
      name: row.company_name,
      domain: row.company_domain ?? undefined,
    };
  }
  return null;
}
