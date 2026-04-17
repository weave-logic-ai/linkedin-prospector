// GET /api/sources/record/[id]
//
// Returns a single source_record with its field-level values. Used by the
// Target Panel drill-down ("click a source → see its source_field_values").

import { NextRequest, NextResponse } from 'next/server';
import { RESEARCH_FLAGS } from '@/lib/config/research-flags';
import { getDefaultTenantId } from '@/lib/db/tenants';
import { query } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!RESEARCH_FLAGS.sources) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  const { id } = await context.params;
  const tenantId = await getDefaultTenantId();

  const rec = await query<{
    id: string;
    source_type: string;
    canonical_url: string;
    title: string | null;
    fetched_at: string;
    published_at: string | null;
    content_bytes: number;
    metadata: unknown;
    status: string;
  }>(
    `SELECT id, source_type, canonical_url, title, fetched_at, published_at,
            content_bytes, metadata, status
     FROM source_records WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id]
  );
  if (!rec.rows[0]) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const fields = await query<{
    field_name: string;
    field_value: unknown;
    subject_kind: string;
    subject_id: string;
    category_default_snapshot: number;
    per_item_multiplier: number;
    final_weight: number;
    referenced_date: string | null;
  }>(
    `SELECT field_name, field_value, subject_kind, subject_id,
            category_default_snapshot, per_item_multiplier, final_weight,
            referenced_date
     FROM source_field_values
     WHERE tenant_id = $1 AND source_record_id = $2
     ORDER BY field_name ASC`,
    [tenantId, id]
  );

  const row = rec.rows[0];
  return NextResponse.json({
    record: {
      id: row.id,
      sourceType: row.source_type,
      canonicalUrl: row.canonical_url,
      title: row.title,
      fetchedAt: row.fetched_at,
      publishedAt: row.published_at,
      contentBytes: row.content_bytes,
      status: row.status,
      metadata: row.metadata,
    },
    fields: fields.rows.map((f) => ({
      fieldName: f.field_name,
      fieldValue: f.field_value,
      subjectKind: f.subject_kind,
      subjectId: f.subject_id,
      categoryDefaultSnapshot: f.category_default_snapshot,
      perItemMultiplier: f.per_item_multiplier,
      finalWeight: f.final_weight,
      referencedDate: f.referenced_date,
    })),
  });
}
