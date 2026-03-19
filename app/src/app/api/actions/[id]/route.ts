// GET  /api/actions/[id] - Get single action with full snapshots
// POST /api/actions/[id] - Revert an action (creates undo entry)

import { NextRequest, NextResponse } from 'next/server';
import * as actionLogQueries from '@/lib/db/queries/action-log';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const action = await actionLogQueries.getAction(id);

    if (!action) {
      return NextResponse.json({ error: 'Action not found' }, { status: 404 });
    }

    return NextResponse.json({ data: action });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get action', details: error instanceof Error ? error.message : undefined },
      { status: 500 }
    );
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await actionLogQueries.revertAction(id);

    if (!result) {
      return NextResponse.json(
        { error: 'Action not found or already reverted' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      data: {
        revertActionId: result.revertActionId,
        beforeSnapshot: result.beforeSnapshot,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to revert action', details: error instanceof Error ? error.message : undefined },
      { status: 500 }
    );
  }
}
