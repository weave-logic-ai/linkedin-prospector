// GET /api/extension/contact/search
//
// Full-text-ish search over `contacts.full_name`, used by the snippet mention
// dropdown to show existing matches before offering "Create new". Per
// `.planning/research-tools-sprint/03-snippet-editor.md` §8.4.
//
// Match strategy (ranked):
//   1. Exact full_name (case-insensitive) — confidence 1.0
//   2. full_name ILIKE q% (prefix) — confidence 0.85
//   3. full_name ILIKE %q% (substring) — confidence 0.6
//
// Snippet-created contacts (linkedin_url like 'snippet-created://%') are
// ranked below real-URL contacts so the dropdown preferences linkedin-backed
// rows when both exist. See §5.1 for the confidence-score contract.
//
// Extension-token auth applies (existing middleware). The route is gated on
// `RESEARCH_FLAGS.snippets` — 404 when disabled.

import { NextRequest, NextResponse } from 'next/server';
import { withExtensionAuth } from '@/lib/middleware/extension-auth-middleware';
import { RESEARCH_FLAGS } from '@/lib/config/research-flags';
import { query } from '@/lib/db/client';

interface ContactSearchRow {
  id: string;
  full_name: string;
  headline: string | null;
  current_company: string | null;
  linkedin_url: string | null;
}

export async function GET(req: NextRequest) {
  if (!RESEARCH_FLAGS.snippets) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  return withExtensionAuth(req, async () => {
    const url = new URL(req.url);
    const qRaw = (url.searchParams.get('q') ?? '').trim();
    if (qRaw.length === 0) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'q parameter is required' },
        { status: 400 }
      );
    }
    if (qRaw.length < 2) {
      return NextResponse.json({ matches: [] });
    }
    const limitParam = Number(url.searchParams.get('limit') ?? '10');
    const limit =
      Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(Math.floor(limitParam), 50)
        : 10;

    try {
      // ILIKE with prefix + substring patterns. We compute a coarse relevance
      // score in SQL so rows can be ordered without a second pass in JS.
      // Snippet-created placeholders sort lower via the CASE in ORDER BY.
      const prefixPattern = `${qRaw.replace(/[%_]/g, '\\$&')}%`;
      const substrPattern = `%${qRaw.replace(/[%_]/g, '\\$&')}%`;
      const result = await query<
        ContactSearchRow & {
          match_type: 'exact' | 'prefix' | 'substring';
          synth: boolean;
        }
      >(
        `SELECT id, full_name, headline, current_company, linkedin_url,
                CASE
                  WHEN LOWER(full_name) = LOWER($1) THEN 'exact'
                  WHEN full_name ILIKE $2 THEN 'prefix'
                  ELSE 'substring'
                END AS match_type,
                (linkedin_url LIKE 'snippet-created://%') AS synth
           FROM contacts
          WHERE is_archived = FALSE
            AND full_name ILIKE $3
          ORDER BY
            CASE
              WHEN LOWER(full_name) = LOWER($1) THEN 0
              WHEN full_name ILIKE $2 THEN 1
              ELSE 2
            END,
            (linkedin_url LIKE 'snippet-created://%') ASC,
            full_name ASC
          LIMIT $4`,
        [qRaw, prefixPattern, substrPattern, limit]
      );

      const matches = result.rows.map((row) => ({
        id: row.id,
        fullName: row.full_name,
        headline: row.headline,
        currentCompany: row.current_company,
        // Never expose the placeholder scheme to callers — emit null instead
        // so the extension UI won't try to render a link.
        linkedinUrl:
          row.linkedin_url && row.linkedin_url.startsWith('snippet-created://')
            ? null
            : row.linkedin_url,
        confidence:
          row.match_type === 'exact'
            ? 1.0
            : row.match_type === 'prefix'
            ? 0.85
            : 0.6,
      }));

      return NextResponse.json({ matches });
    } catch (err) {
      console.error('[Contact Search] Failed:', err);
      return NextResponse.json(
        { error: 'INTERNAL_ERROR', message: (err as Error).message },
        { status: 500 }
      );
    }
  });
}
