// POST /api/sources/cron/wayback-seed
//
// For each research_target with a resolvable canonical URL (contact or
// company), trigger a Wayback fetch. Idempotent: `writeSourceRecord` dedups on
// (tenant, source_type, source_id).
//
// Protected by the `X-Cron-Secret` header. Gated on RESEARCH_FLAGS.sources.

import { NextRequest, NextResponse } from 'next/server';
import { RESEARCH_FLAGS } from '@/lib/config/research-flags';
import { isCronAuthorized } from '@/lib/sources/cron-auth';
import { getDefaultTenantId } from '@/lib/db/tenants';
import { query } from '@/lib/db/client';
import { waybackConnector } from '@/lib/sources/connectors/wayback';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min hard cap

interface TargetRow {
  id: string;
  kind: string;
  contact_id: string | null;
  company_id: string | null;
  contact_linkedin_url: string | null;
  company_linkedin_url: string | null;
  company_website: string | null;
}

export async function POST(req: NextRequest) {
  if (!RESEARCH_FLAGS.sources) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const tenantId = await getDefaultTenantId();

  const targets = await query<TargetRow>(
    `SELECT rt.id, rt.kind, rt.contact_id, rt.company_id,
            c.linkedin_url AS contact_linkedin_url,
            co.linkedin_url AS company_linkedin_url,
            co.website AS company_website
     FROM research_targets rt
     LEFT JOIN contacts c ON c.id = rt.contact_id
     LEFT JOIN companies co ON co.id = rt.company_id
     WHERE rt.tenant_id = $1 AND rt.kind IN ('contact', 'company')
     ORDER BY rt.last_used_at DESC
     LIMIT 50`,
    [tenantId]
  );

  const results: Array<{
    targetId: string;
    url: string | null;
    ok: boolean;
    summary: string;
    error?: string;
  }> = [];

  for (const row of targets.rows) {
    const url =
      row.contact_linkedin_url ??
      row.company_linkedin_url ??
      row.company_website ??
      null;
    if (!url) {
      results.push({
        targetId: row.id,
        url: null,
        ok: false,
        summary: 'no canonical URL',
      });
      continue;
    }
    try {
      const result = await waybackConnector.invoke(
        { url },
        { tenantId, userId: null, targetId: row.id }
      );
      results.push({
        targetId: row.id,
        url,
        ok: true,
        summary: result.summary,
      });
    } catch (err) {
      results.push({
        targetId: row.id,
        url,
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
