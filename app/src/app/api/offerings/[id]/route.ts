// PUT    /api/offerings/[id] - Update an offering
// DELETE /api/offerings/[id] - Delete an offering

import { NextRequest, NextResponse } from 'next/server';
import * as offeringsQueries from '@/lib/db/queries/offerings';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { name, description, is_active, sort_order } = body as {
      name?: string;
      description?: string;
      is_active?: boolean;
      sort_order?: number;
    };

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (is_active !== undefined) updates.is_active = is_active;
    if (sort_order !== undefined) updates.sort_order = sort_order;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const offering = await offeringsQueries.updateOffering(id, updates);

    if (!offering) {
      return NextResponse.json({ error: 'Offering not found' }, { status: 404 });
    }

    return NextResponse.json({ data: offering });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update offering', details: error instanceof Error ? error.message : undefined },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deleted = await offeringsQueries.deleteOffering(id);

    if (!deleted) {
      return NextResponse.json({ error: 'Offering not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete offering', details: error instanceof Error ? error.message : undefined },
      { status: 500 }
    );
  }
}
