// GET /api/icps - list all ICPs
// POST /api/icps - create an ICP

import { NextRequest, NextResponse } from 'next/server';
import { listIcps, createIcp } from '@/lib/db/queries/icps';

function snakeToCamel(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = value;
  }
  return result;
}

export async function GET() {
  try {
    const icps = await listIcps();
    return NextResponse.json({
      data: icps.map((row) => snakeToCamel(row as unknown as Record<string, unknown>)),
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to list ICPs', details: error instanceof Error ? error.message : undefined },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json(
        { error: 'name is required and must be a string' },
        { status: 400 }
      );
    }

    if (!body.criteria || typeof body.criteria !== 'object') {
      return NextResponse.json(
        { error: 'criteria is required and must be an object' },
        { status: 400 }
      );
    }

    const icp = await createIcp({
      name: body.name,
      description: body.description,
      criteria: body.criteria,
      is_active: body.is_active,
    });

    return NextResponse.json(
      { data: snakeToCamel(icp as unknown as Record<string, unknown>) },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create ICP', details: error instanceof Error ? error.message : undefined },
      { status: 500 }
    );
  }
}
