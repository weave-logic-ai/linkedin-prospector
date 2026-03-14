// GET /api/contacts/hybrid-search - Combined keyword (trigram) + vector similarity search

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/client';

interface ContactRow {
  id: string;
  linkedin_url: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  headline: string | null;
  title: string | null;
  current_company: string | null;
  current_company_id: string | null;
  location: string | null;
  about: string | null;
  email: string | null;
  phone: string | null;
  connections_count: number | null;
  degree: number;
  profile_image_url: string | null;
  tags: string[];
  notes: string | null;
  is_archived: boolean;
  dedup_hash: string | null;
  created_at: Date;
  updated_at: Date;
}

interface HybridSearchResult {
  contact: ContactRow;
  keywordScore: number;
  vectorScore: number;
  fusionScore: number;
}

/**
 * Attempts hybrid search (keyword + vector). Falls back to keyword-only
 * if ruvector_embed is unavailable (e.g., outside ruvector-postgres).
 */
async function hybridSearch(
  searchQuery: string,
  limit: number
): Promise<HybridSearchResult[]> {
  try {
    return await fullHybridSearch(searchQuery, limit);
  } catch (error) {
    // If the vector function doesn't exist, fall back to keyword-only
    const message = error instanceof Error ? error.message : '';
    if (
      message.includes('ruvector_embed') ||
      message.includes('function') ||
      message.includes('does not exist')
    ) {
      return keywordOnlySearch(searchQuery, limit);
    }
    throw error;
  }
}

async function fullHybridSearch(
  searchQuery: string,
  limit: number
): Promise<HybridSearchResult[]> {
  const result = await query<ContactRow & {
    keyword_score: number;
    vector_score: number;
    fusion_score: number;
  }>(
    `WITH keyword_matches AS (
      SELECT id,
        GREATEST(
          similarity(full_name, $1),
          similarity(COALESCE(headline, ''), $1),
          similarity(COALESCE(title, ''), $1),
          similarity(COALESCE(current_company, ''), $1)
        ) AS keyword_score
      FROM contacts
      WHERE NOT is_archived
        AND (full_name % $1 OR headline % $1 OR title % $1 OR current_company % $1)
    ),
    vector_matches AS (
      SELECT pe.contact_id AS id,
        1 - (pe.embedding <=> ruvector_embed('all-MiniLM-L6-v2', $1)) AS vector_score
      FROM profile_embeddings pe
      ORDER BY pe.embedding <=> ruvector_embed('all-MiniLM-L6-v2', $1)
      LIMIT 50
    )
    SELECT c.*,
      COALESCE(km.keyword_score, 0)::real AS keyword_score,
      COALESCE(vm.vector_score, 0)::real AS vector_score,
      (0.4 * COALESCE(km.keyword_score, 0) + 0.6 * COALESCE(vm.vector_score, 0))::real AS fusion_score
    FROM contacts c
    LEFT JOIN keyword_matches km ON c.id = km.id
    LEFT JOIN vector_matches vm ON c.id = vm.id
    WHERE (km.id IS NOT NULL OR vm.id IS NOT NULL)
      AND NOT c.is_archived
    ORDER BY fusion_score DESC
    LIMIT $2`,
    [searchQuery, limit]
  );

  return result.rows.map(mapHybridResult);
}

async function keywordOnlySearch(
  searchQuery: string,
  limit: number
): Promise<HybridSearchResult[]> {
  const result = await query<ContactRow & {
    keyword_score: number;
  }>(
    `SELECT c.*,
      GREATEST(
        similarity(c.full_name, $1),
        similarity(COALESCE(c.headline, ''), $1),
        similarity(COALESCE(c.title, ''), $1),
        similarity(COALESCE(c.current_company, ''), $1)
      )::real AS keyword_score
    FROM contacts c
    WHERE NOT c.is_archived
      AND (c.full_name % $1 OR c.headline % $1 OR c.title % $1 OR c.current_company % $1)
    ORDER BY keyword_score DESC
    LIMIT $2`,
    [searchQuery, limit]
  );

  return result.rows.map((row) => {
    const { keyword_score, ...contact } = row;
    return {
      contact: contact as ContactRow,
      keywordScore: keyword_score,
      vectorScore: 0,
      fusionScore: 0.4 * keyword_score,
    };
  });
}

function mapHybridResult(
  row: ContactRow & { keyword_score: number; vector_score: number; fusion_score: number }
): HybridSearchResult {
  const { keyword_score, vector_score, fusion_score, ...contact } = row;
  return {
    contact: contact as ContactRow,
    keywordScore: keyword_score,
    vectorScore: vector_score,
    fusionScore: fusion_score,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));

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

    const results = await hybridSearch(q.trim(), limit);

    return NextResponse.json({ data: { results } });
  } catch (error) {
    return NextResponse.json(
      { error: 'Hybrid search failed', details: error instanceof Error ? error.message : undefined },
      { status: 500 }
    );
  }
}
