// GET /api/icps/:id - get single ICP
// PUT /api/icps/:id - update ICP
// DELETE /api/icps/:id - delete ICP

import { NextRequest, NextResponse } from 'next/server';
import { getIcp, updateIcp, deleteIcp } from '@/lib/db/queries/icps';

function snakeToCamel(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = value;
  }
  return result;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: 'Invalid ICP ID format' }, { status: 400 });
  }

  try {
    const icp = await getIcp(id);
    if (!icp) {
      return NextResponse.json({ error: 'ICP not found' }, { status: 404 });
    }
    return NextResponse.json({ data: snakeToCamel(icp as unknown as Record<string, unknown>) });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get ICP', details: error instanceof Error ? error.message : undefined },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: 'Invalid ICP ID format' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const icp = await updateIcp(id, body);

    if (!icp) {
      return NextResponse.json({ error: 'ICP not found or no valid fields' }, { status: 404 });
    }

    return NextResponse.json({ data: snakeToCamel(icp as unknown as Record<string, unknown>) });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update ICP', details: error instanceof Error ? error.message : undefined },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: 'Invalid ICP ID format' }, { status: 400 });
  }

  try {
    const deleted = await deleteIcp(id);
    if (!deleted) {
      return NextResponse.json({ error: 'ICP not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete ICP', details: error instanceof Error ? error.message : undefined },
      { status: 500 }
    );
  }
}
