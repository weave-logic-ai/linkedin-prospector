// GET /api/actions - List action log entries with optional filters

import { NextRequest, NextResponse } from 'next/server';
import * as actionLogQueries from '@/lib/db/queries/action-log';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const targetType = searchParams.get('targetType') ?? undefined;
    const targetId = searchParams.get('targetId') ?? undefined;
    const actionType = searchParams.get('actionType') ?? undefined;
    const limit = searchParams.get('limit')
      ? parseInt(searchParams.get('limit')!, 10)
      : undefined;
    const offset = searchParams.get('offset')
      ? parseInt(searchParams.get('offset')!, 10)
      : undefined;

    const result = await actionLogQueries.listActions({
      targetType,
      targetId,
      actionType,
      limit,
      offset,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to list actions', details: error instanceof Error ? error.message : undefined },
      { status: 500 }
    );
  }
}
