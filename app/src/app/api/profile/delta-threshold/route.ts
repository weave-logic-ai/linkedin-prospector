// GET  /api/profile/delta-threshold — current owner's delta-highlight threshold
// PUT  /api/profile/delta-threshold — update it (clamped to [0, 1])
//
// Phase 4 Track I. Lightweight settings endpoint backing the user-facing
// threshold slider on `/profile`. Threshold is owner-level (not per-target)
// so both endpoints read/write `owner_profiles.delta_highlight_threshold`.

import { NextRequest, NextResponse } from 'next/server';
import {
  getOwnerDeltaThreshold,
  setOwnerDeltaThreshold,
  DEFAULT_DELTA_HIGHLIGHT_THRESHOLD,
} from '@/lib/scoring/delta-threshold';

export async function GET() {
  try {
    const threshold = await getOwnerDeltaThreshold();
    return NextResponse.json({ data: { threshold } });
  } catch (error) {
    return NextResponse.json(
      {
        data: { threshold: DEFAULT_DELTA_HIGHLIGHT_THRESHOLD },
        error: error instanceof Error ? error.message : undefined,
      },
      { status: 200 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      threshold?: number;
    };
    if (typeof body.threshold !== 'number' || !Number.isFinite(body.threshold)) {
      return NextResponse.json(
        { error: 'threshold must be a finite number in [0, 1]' },
        { status: 400 }
      );
    }
    if (body.threshold < 0 || body.threshold > 1) {
      return NextResponse.json(
        { error: 'threshold must be in [0, 1]' },
        { status: 400 }
      );
    }
    const persisted = await setOwnerDeltaThreshold(body.threshold);
    return NextResponse.json({ data: { threshold: persisted } });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to update threshold',
        details: error instanceof Error ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
