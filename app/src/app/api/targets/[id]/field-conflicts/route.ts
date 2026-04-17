// GET /api/targets/[id]/field-conflicts?fields=title,company,location
//
// Per-field conflict summary for a research target. Returns the
// DisagreementResult shape from `lib/sources/disagreement-detector.ts` for
// each requested field. The banner UI (contact + company detail pages)
// consumes this endpoint to decide which banners to render.
//
// Behavior:
//   - `fields` query param: comma-separated field names. Default set is
//     `title,company,location,headline` — enough to drive the banner on
//     the common target-detail layouts.
//   - Resolves the research_target → entity (contact/company) id just like
//     `/api/sources/target/[targetId]`.
//   - Feature-flag gated on `RESEARCH_FLAGS.sources` like its sibling.

import { NextRequest, NextResponse } from 'next/server';
import { RESEARCH_FLAGS } from '@/lib/config/research-flags';
import { getDefaultTenantId } from '@/lib/db/tenants';
import { query } from '@/lib/db/client';
import { detectFieldConflictsForEntity } from '@/lib/sources/disagreement-detector';

export const dynamic = 'force-dynamic';

const DEFAULT_FIELDS = ['title', 'company', 'location', 'headline'];

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!RESEARCH_FLAGS.sources) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  const { id } = await context.params;
  if (typeof id !== 'string' || id.length === 0) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: 'targetId required' },
      { status: 400 }
    );
  }

  const fieldsParam = req.nextUrl.searchParams.get('fields');
  const rawFields = fieldsParam
    ? fieldsParam
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.length <= 128)
    : DEFAULT_FIELDS;
  if (rawFields.length === 0 || rawFields.length > 32) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: 'fields: 1–32 required' },
      { status: 400 }
    );
  }

  const tenantId = await getDefaultTenantId();

  const t = await query<{
    kind: string;
    contact_id: string | null;
    company_id: string | null;
  }>(
    `SELECT kind, contact_id, company_id FROM research_targets
      WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id]
  );
  if (!t.rows[0]) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  const entityId = t.rows[0].contact_id ?? t.rows[0].company_id;
  const entityKind: 'contact' | 'company' = t.rows[0].contact_id ? 'contact' : 'company';
  if (!entityId) {
    return NextResponse.json({ conflicts: {} });
  }

  const conflicts = await detectFieldConflictsForEntity(
    tenantId,
    entityKind,
    entityId,
    rawFields
  );
  return NextResponse.json({
    entityKind,
    entityId,
    conflicts,
  });
}
