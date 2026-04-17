// GET /api/companies/search?q=query - keyword search across companies.
//
// Added for WS-4 target picker (Phase 1 Track B). Mirrors the shape of
// /api/contacts/search: returns a `data` array of rows with `id`, `name`,
// and optional `industry` / `domain` so the picker modal can render a
// consistent result list.

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/client';

interface CompanyRow {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  industry: string | null;
  size_range: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));

    if (!q || q.trim().length === 0) {
      return NextResponse.json(
        { error: 'Search query parameter "q" is required' },
        { status: 400 }
      );
    }

    if (q.length > 200) {
      return NextResponse.json(
        { error: 'Search query too long (max 200 characters)' },
        { status: 400 }
      );
    }

    const like = `%${q.trim().replace(/[%_]/g, (m) => `\\${m}`)}%`;

    const result = await query<CompanyRow>(
      `SELECT id, name, slug, domain, industry, size_range
       FROM companies
       WHERE name ILIKE $1 OR COALESCE(domain, '') ILIKE $1
       ORDER BY name ASC
       LIMIT $2`,
      [like, limit]
    );

    return NextResponse.json({
      data: result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        domain: row.domain,
        industry: row.industry,
        sizeRange: row.size_range,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Search failed', details: error instanceof Error ? error.message : undefined },
      { status: 500 }
    );
  }
}
