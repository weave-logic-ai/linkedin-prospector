// PUT /api/targets/:id/lenses/:lensId/activate
//
// Switches the "active" lens for a target — the lens-service marks this row
// as `is_default=true` and clears the flag on every sibling in the same
// transaction. See `app/src/lib/targets/lens-service.ts` for why this stands
// in for a `research_target_state.last_used_lens_id` column (the column
// does not exist on migration 035).

import { NextRequest, NextResponse } from 'next/server';
import { activateLensForTarget } from '@/lib/targets/lens-service';
import { getTargetById } from '@/lib/targets/service';
import { invalidateForTarget } from '@/lib/graph/data-cache';

export async function PUT(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; lensId: string }> }
) {
  try {
    const { id, lensId } = await params;
    const target = await getTargetById(id);
    if (!target) {
      return NextResponse.json({ error: 'Target not found' }, { status: 404 });
    }
    const lens = await activateLensForTarget(id, lensId);
    if (!lens) {
      return NextResponse.json(
        { error: 'Lens not found for this target' },
        { status: 404 }
      );
    }
    // Phase 4 Track I: invalidate the graph-data cache for this target since
    // the active ICP set (and therefore scoring) changed.
    invalidateForTarget(id);
    return NextResponse.json({ data: lens });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to activate lens', details: error instanceof Error ? error.message : undefined },
      { status: 500 }
    );
  }
}
