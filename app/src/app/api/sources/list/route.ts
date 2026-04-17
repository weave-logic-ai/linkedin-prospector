// GET /api/sources/list
//
// Paginated listing of `source_records` for the current tenant, with optional
// `?sourceType=` filter. Gated on RESEARCH_FLAGS.sources — returns 404 when
// the feature is off.

import { NextRequest, NextResponse } from 'next/server';
import { RESEARCH_FLAGS } from '@/lib/config/research-flags';
import { getDefaultTenantId } from '@/lib/db/tenants';
import { query } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

interface RowShape {
  id: string;
  source_type: string;
  canonical_url: string;
  title: string | null;
  fetched_at: string;
  published_at: string | null;
  content_bytes: number;
  status: string;
  metadata: unknown;
}

export async function GET(req: NextRequest) {
  if (!RESEARCH_FLAGS.sources) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const url = new URL(req.url);
  const sourceType = url.searchParams.get('sourceType');
  const limit = Math.min(
    Math.max(1, Number(url.searchParams.get('limit') ?? '50')),
    200
  );
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? '0'));

  const tenantId = await getDefaultTenantId();

  const params: unknown[] = [tenantId];
  let where = 'WHERE tenant_id = $1';
  if (sourceType) {
    params.push(sourceType);
    where += ` AND source_type = $${params.length}`;
  }
  params.push(limit);
  params.push(offset);

  const res = await query<RowShape>(
    `SELECT id, source_type, canonical_url, title, fetched_at, published_at,
            content_bytes, status, metadata
     FROM source_records
     ${where}
     ORDER BY fetched_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return NextResponse.json({
    rows: res.rows.map((row) => {
      const metadata = (row.metadata as Record<string, unknown>) ?? {};
      const wayback = metadata.wayback as Record<string, unknown> | undefined;
      return {
        id: row.id,
        sourceType: row.source_type,
        canonicalUrl: row.canonical_url,
        title: row.title,
        fetchedAt: row.fetched_at,
        publishedAt: row.published_at,
        contentBytes: row.content_bytes,
        status: row.status,
        perItemMultiplier:
          typeof wayback?.perItemMultiplier === 'number'
            ? (wayback.perItemMultiplier as number)
            : 1.0,
        reparseStored: wayback?.reparseStored === true,
        capturedAt:
          typeof wayback?.capturedAt === 'string'
            ? (wayback.capturedAt as string)
            : null,
      };
    }),
    limit,
    offset,
  });
}
