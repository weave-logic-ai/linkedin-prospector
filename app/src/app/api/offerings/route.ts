// GET  /api/offerings - List all offerings
// POST /api/offerings - Create a new offering

import { NextRequest, NextResponse } from 'next/server';
import * as offeringsQueries from '@/lib/db/queries/offerings';

export async function GET() {
  try {
    const offerings = await offeringsQueries.listOfferings();
    return NextResponse.json({ data: offerings });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to list offerings', details: error instanceof Error ? error.message : undefined },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { name, description } = body as {
      name?: string;
      description?: string;
    };

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Name is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    const offering = await offeringsQueries.createOffering({
      name: name.trim(),
      description: description?.trim(),
    });

    return NextResponse.json({ data: offering }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create offering', details: error instanceof Error ? error.message : undefined },
      { status: 500 }
    );
  }
}
