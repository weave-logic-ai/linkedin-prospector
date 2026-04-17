// DELETE /api/targets/:id/lenses/:lensId — soft-delete a lens
//
// Phase 4 Track H. Sets `deleted_at` via `softDeleteLens` so shared deep-link
// URLs can render a "this lens was deleted" banner instead of a 404. See
// `app/src/lib/targets/lens-service.ts` for the soft-delete semantics.

import { NextRequest, NextResponse } from 'next/server';
import { softDeleteLens } from '@/lib/targets/lens-service';
import { getTargetById } from '@/lib/targets/service';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; lensId: string }> }
) {
  try {
    const { id, lensId } = await params;
    const target = await getTargetById(id);
    if (!target) {
      return NextResponse.json({ error: 'Target not found' }, { status: 404 });
    }
    const lens = await softDeleteLens(id, lensId);
    if (!lens) {
      return NextResponse.json(
        { error: 'Lens not found or already deleted' },
        { status: 404 }
      );
    }
    return NextResponse.json({ data: lens });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to delete lens',
        details: error instanceof Error ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
