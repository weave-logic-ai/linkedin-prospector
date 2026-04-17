// GET /api/sources/target/[targetId]
//
// Returns source_records attached to a research target, grouped by source_type,
// ordered by fetched_at DESC. Used by the Target Panel "Sources" section.
//
// A source is "attached" when either:
//   1. A source_record_entities row links it to the target's contact_id or
//      company_id, OR
//   2. A source_field_values row points at the target's contact/company id
//      as subject_id.
// Both paths are unioned.

import { NextRequest, NextResponse } from 'next/server';
import { RESEARCH_FLAGS } from '@/lib/config/research-flags';
import { getDefaultTenantId } from '@/lib/db/tenants';
import { query } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

interface Row {
  id: string;
  source_type: string;
  canonical_url: string;
  title: string | null;
  fetched_at: string;
  published_at: string | null;
  status: string;
  metadata: unknown;
  subject_kind: string | null;
  subject_id: string | null;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ targetId: string }> }
) {
  if (!RESEARCH_FLAGS.sources) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  const { targetId } = await context.params;
  if (typeof targetId !== 'string' || targetId.length === 0) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: 'targetId required' },
      { status: 400 }
    );
  }

  const tenantId = await getDefaultTenantId();

  // Resolve the research_target to its entity id (contact or company).
  const t = await query<{
    kind: string;
    contact_id: string | null;
    company_id: string | null;
  }>(
    `SELECT kind, contact_id, company_id FROM research_targets
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, targetId]
  );
  if (!t.rows[0]) {
    return NextResponse.json({ rows: [] });
  }
  const entityId = t.rows[0].contact_id ?? t.rows[0].company_id;
  const entityKind = t.rows[0].contact_id ? 'contact' : 'company';
  if (!entityId) return NextResponse.json({ rows: [] });

  const res = await query<Row>(
    `SELECT DISTINCT sr.id, sr.source_type, sr.canonical_url, sr.title,
            sr.fetched_at, sr.published_at, sr.status, sr.metadata,
            $3::text AS subject_kind, $2::uuid AS subject_id
     FROM source_records sr
     WHERE sr.tenant_id = $1 AND (
       EXISTS (
         SELECT 1 FROM source_record_entities sre
         WHERE sre.source_record_id = sr.id
           AND sre.entity_kind = $3 AND sre.entity_id = $2
       )
       OR EXISTS (
         SELECT 1 FROM source_field_values sfv
         WHERE sfv.source_record_id = sr.id
           AND sfv.subject_kind = $3 AND sfv.subject_id = $2
       )
     )
     ORDER BY sr.fetched_at DESC
     LIMIT 100`,
    [tenantId, entityId, entityKind]
  );

  return NextResponse.json({
    rows: res.rows.map((row) => ({
      id: row.id,
      sourceType: row.source_type,
      canonicalUrl: row.canonical_url,
      title: row.title,
      fetchedAt: row.fetched_at,
      publishedAt: row.published_at,
      status: row.status,
      subjectKind: row.subject_kind,
      subjectId: row.subject_id,
    })),
  });
}
