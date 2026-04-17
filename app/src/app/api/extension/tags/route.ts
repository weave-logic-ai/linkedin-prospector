// GET /api/extension/tags
//
// Returns the tenant's snippet tag taxonomy so the extension widget can render
// the tag-chip picker. Seeded in migration `034-snippets-schema.sql` per
// `.planning/research-tools-sprint/03-snippet-editor.md` §6.1.
//
// Gated on `RESEARCH_FLAGS.snippets`. Returns 404 when disabled.

import { NextRequest, NextResponse } from 'next/server';
import { withExtensionAuth } from '@/lib/middleware/extension-auth-middleware';
import { RESEARCH_FLAGS } from '@/lib/config/research-flags';
import { query } from '@/lib/db/client';
import { getDefaultTenantId } from '@/lib/snippets/tenant';
import type { SnippetTagRow } from '@/lib/snippets/types';

export async function GET(req: NextRequest) {
  if (!RESEARCH_FLAGS.snippets) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  return withExtensionAuth(req, async () => {
    try {
      const tenantId = await getDefaultTenantId();
      const res = await query<{
        slug: string;
        label: string;
        parent_slug: string | null;
        is_seeded: boolean;
      }>(
        `SELECT slug, label, parent_slug, is_seeded FROM snippet_tags
         WHERE tenant_id = $1
         ORDER BY parent_slug NULLS FIRST, slug`,
        [tenantId]
      );
      const tags: SnippetTagRow[] = res.rows.map((r) => ({
        slug: r.slug,
        label: r.label,
        parentSlug: r.parent_slug,
        isSeeded: r.is_seeded,
      }));
      return NextResponse.json({ tags });
    } catch (err) {
      console.error('[Snippet tags] query failed:', err);
      return NextResponse.json(
        { error: 'INTERNAL_ERROR', message: (err as Error).message },
        { status: 500 }
      );
    }
  });
}
