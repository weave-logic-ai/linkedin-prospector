// POST /api/targets — create (or fetch existing) target for a contact or company
//
// Body: { kind: 'contact' | 'company', id: string }
//
// Used by the target picker (Phase 1 Track B): selecting a search result
// upserts a research_targets row and returns its id so the client can PUT it
// into /api/targets/state.

import { NextRequest, NextResponse } from 'next/server';
import {
  getOrCreateContactTarget,
  getOrCreateCompanyTarget,
  getDefaultTenantId,
} from '@/lib/targets/service';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      kind?: string;
      id?: string;
    };

    if (!body.id || typeof body.id !== 'string') {
      return NextResponse.json({ error: 'Missing `id`' }, { status: 400 });
    }

    const tenantId = await getDefaultTenantId();

    if (body.kind === 'contact') {
      const target = await getOrCreateContactTarget(body.id, tenantId);
      return NextResponse.json({ data: target });
    }
    if (body.kind === 'company') {
      const target = await getOrCreateCompanyTarget(body.id, tenantId);
      return NextResponse.json({ data: target });
    }

    return NextResponse.json(
      { error: 'Invalid `kind` — must be `contact` or `company`' },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create target', details: error instanceof Error ? error.message : undefined },
      { status: 500 }
    );
  }
}
