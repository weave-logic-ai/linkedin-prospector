// POST   /api/targets/[id]/field-overrides
// DELETE /api/targets/[id]/field-overrides?field=title
//
// Set or clear a source_field_overrides row for the target's entity.
// Per ADR-032 the override wins at display time and blocks automatic
// reconciliation; the banner still surfaces newly-ingested disagreements.

import { NextRequest, NextResponse } from 'next/server';
import { RESEARCH_FLAGS } from '@/lib/config/research-flags';
import { getDefaultTenantId } from '@/lib/db/tenants';
import { query } from '@/lib/db/client';
import { getCurrentOwnerProfileId } from '@/lib/targets/service';
import {
  setFieldOverride,
  clearFieldOverride,
  listActiveOverrides,
} from '@/lib/sources/field-override-service';

export const dynamic = 'force-dynamic';

async function resolveTargetEntity(id: string) {
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
  const row = t.rows[0];
  if (!row) return null;
  const entityId = row.contact_id ?? row.company_id;
  const entityKind: 'contact' | 'company' = row.contact_id ? 'contact' : 'company';
  if (!entityId) return null;
  return { tenantId, entityKind, entityId };
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!RESEARCH_FLAGS.sources) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  const { id } = await context.params;
  const target = await resolveTargetEntity(id);
  if (!target) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  const rows = await listActiveOverrides(
    target.tenantId,
    target.entityKind,
    target.entityId
  );
  return NextResponse.json({ overrides: rows });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!RESEARCH_FLAGS.sources) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  const { id } = await context.params;
  const body = (await req.json().catch(() => ({}))) as {
    fieldName?: unknown;
    value?: unknown;
    note?: unknown;
  };
  if (typeof body.fieldName !== 'string' || body.fieldName.length === 0) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: '`fieldName` required' },
      { status: 400 }
    );
  }
  if (typeof body.value !== 'string') {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: '`value` must be a string' },
      { status: 400 }
    );
  }
  const target = await resolveTargetEntity(id);
  if (!target) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  const userId = await getCurrentOwnerProfileId();
  const row = await setFieldOverride({
    tenantId: target.tenantId,
    entityKind: target.entityKind,
    entityId: target.entityId,
    fieldName: body.fieldName,
    value: body.value,
    setByUserId: userId,
    note: typeof body.note === 'string' ? body.note : null,
  });
  return NextResponse.json({ override: row });
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!RESEARCH_FLAGS.sources) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  const { id } = await context.params;
  const field = req.nextUrl.searchParams.get('field');
  if (!field) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: '`field` query param required' },
      { status: 400 }
    );
  }
  const target = await resolveTargetEntity(id);
  if (!target) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  const userId = await getCurrentOwnerProfileId();
  const cleared = await clearFieldOverride(
    target.tenantId,
    target.entityKind,
    target.entityId,
    field,
    userId
  );
  return NextResponse.json({ cleared });
}
