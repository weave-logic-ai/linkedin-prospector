// GET  /api/targets/state/history  — read the last N history entries
// POST /api/targets/state/history  — append a history entry
//
// Phase 4 Track H. Backs the breadcrumb hover card + swap-back button on
// `target-breadcrumbs.tsx`. The underlying storage is a JSONB ring-buffer
// (`research_target_state.history`, migration 043) with a hard cap enforced
// in `history-service.ts`.

import { NextRequest, NextResponse } from 'next/server';
import {
  readTargetHistory,
  pushTargetHistory,
  type TargetHistoryEntry,
} from '@/lib/targets/history-service';
import { getCurrentOwnerProfileId, getTargetById } from '@/lib/targets/service';

function parseLimit(url: string): number {
  const parsed = new URL(url);
  const raw = parsed.searchParams.get('limit');
  const n = raw ? Number.parseInt(raw, 10) : 5;
  if (!Number.isFinite(n) || n <= 0) return 5;
  return Math.min(n, 20);
}

export async function GET(request: NextRequest) {
  try {
    const ownerId = await getCurrentOwnerProfileId();
    if (!ownerId) return NextResponse.json({ data: [] });
    const limit = parseLimit(request.url);
    const history = await readTargetHistory(ownerId, limit);
    return NextResponse.json({ data: history });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to read target history',
        details: error instanceof Error ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ownerId = await getCurrentOwnerProfileId();
    if (!ownerId) {
      return NextResponse.json(
        { error: 'No owner profile configured' },
        { status: 400 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      targetId?: string;
      lensId?: string | null;
      openedAt?: string;
    };

    if (!body.targetId || typeof body.targetId !== 'string') {
      return NextResponse.json({ error: 'Missing `targetId`' }, { status: 400 });
    }

    // Verify the target exists — stale client should not wedge the buffer
    // with orphaned ids.
    const target = await getTargetById(body.targetId);
    if (!target) {
      return NextResponse.json({ error: 'Target not found' }, { status: 404 });
    }

    const entry: TargetHistoryEntry = {
      targetId: body.targetId,
      lensId:
        typeof body.lensId === 'string' && body.lensId.length > 0
          ? body.lensId
          : null,
      openedAt:
        typeof body.openedAt === 'string' && body.openedAt.length > 0
          ? body.openedAt
          : new Date().toISOString(),
    };

    const history = await pushTargetHistory(ownerId, entry);
    return NextResponse.json({ data: history });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to append target history',
        details: error instanceof Error ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
