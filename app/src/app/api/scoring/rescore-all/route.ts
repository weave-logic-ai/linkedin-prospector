// POST /api/scoring/rescore-all - Trigger a full rescore of all contacts
// Returns a run ID for status polling
//
// Phase 1.5 — WS-4 per-target ICP plumbing: body or query may include a
// `targetId`. When set (and the targets flag is on), every contact is
// rescored under the target's active lens. When absent, behavior is today's
// owner-default rescore.

import { NextRequest, NextResponse } from 'next/server';
import { triggerRescoreAll } from '@/lib/scoring/auto-score';

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const body = (await request.json().catch(() => ({}))) as { targetId?: string };
    const targetId = body.targetId ?? searchParams.get('targetId') ?? undefined;

    const runId = await triggerRescoreAll(targetId);
    return NextResponse.json({
      data: {
        runId,
        status: 'running',
        targetId: targetId ?? null,
        message: 'Rescore started. Poll /api/scoring/status?runId= for progress.',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to start rescore', details: error instanceof Error ? error.message : undefined },
      { status: 500 }
    );
  }
}
