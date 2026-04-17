// Snippets panel — Phase 1 Track C.
//
// Lists snippets attached to the currently-targeted entity. Reads the
// current `research_target_state.secondary_target_id` if present, falling
// back to `primary_target_id` (which is the owner's self-target in v1 per
// ADR-027 + `10-decisions.md` Q4). When the secondary is not set, the page
// renders snippets linked to the self target.
//
// Gated on `RESEARCH_FLAGS.snippets` — returns 404 when disabled, per the
// Phase 1 Track C acceptance checklist.

import { notFound } from 'next/navigation';
import { RESEARCH_FLAGS } from '@/lib/config/research-flags';
import { listSnippetsForTarget } from '@/lib/snippets/service';
import { getDefaultTenantId } from '@/lib/snippets/tenant';
import { query } from '@/lib/db/client';
import type { SnippetTargetKind } from '@/lib/snippets/chain';

export const dynamic = 'force-dynamic';

interface ResolvedActiveTarget {
  kind: SnippetTargetKind;
  id: string;
  label: string;
}

/**
 * Resolve the currently-active target for the snippets panel.
 *
 * Reads `research_target_state.secondary_target_id` first (the UI-centered
 * focus per Q4), falling back to `primary_target_id` (the self-target).
 * Table existence is probed defensively — Track B's migration 035 creates
 * both tables; if either is absent (e.g. running against an unmigrated dev
 * volume), we return null and the page renders the empty-state card.
 */
async function resolveActiveTarget(
  tenantId: string
): Promise<ResolvedActiveTarget | null> {
  // Guard: Track B's research_targets may or may not exist on this DB.
  // The presence-check is cheap (one pg_class lookup). If missing, bail out
  // with null so the page renders the friendly empty state.
  const hasTargets = await query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'research_targets'
     ) AS exists`
  );
  if (!hasTargets.rows[0]?.exists) return null;

  const hasState = await query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'research_target_state'
     ) AS exists`
  );

  let activeTargetId: string | null = null;
  if (hasState.rows[0]?.exists) {
    const stateRes = await query<{
      primary_target_id: string | null;
      secondary_target_id: string | null;
    }>(
      `SELECT primary_target_id, secondary_target_id
       FROM research_target_state
       WHERE tenant_id = $1
       LIMIT 1`,
      [tenantId]
    );
    const row = stateRes.rows[0];
    activeTargetId =
      (row?.secondary_target_id as string | null) ??
      (row?.primary_target_id as string | null) ??
      null;
  }

  if (!activeTargetId) {
    // Fallback: first self-target for this tenant.
    const selfRes = await query<{ id: string }>(
      `SELECT id FROM research_targets
       WHERE tenant_id = $1 AND kind = 'self'
       ORDER BY created_at ASC LIMIT 1`,
      [tenantId]
    );
    activeTargetId = selfRes.rows[0]?.id ?? null;
  }

  if (!activeTargetId) return null;

  const t = await query<{
    id: string;
    kind: SnippetTargetKind;
    label: string;
  }>(
    `SELECT id, kind, label FROM research_targets
     WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [activeTargetId, tenantId]
  );
  if (!t.rows[0]) return null;
  return {
    kind: t.rows[0].kind,
    id: t.rows[0].id,
    label: t.rows[0].label,
  };
}

interface PageProps {
  searchParams?: Promise<{ tag?: string }>;
}

export default async function SnippetsPage({ searchParams }: PageProps) {
  if (!RESEARCH_FLAGS.snippets) {
    notFound();
  }
  const resolvedSearch = (await searchParams) ?? {};
  const tagFilter = resolvedSearch.tag;

  const tenantId = await getDefaultTenantId();
  const target = await resolveActiveTarget(tenantId);

  if (!target) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-2">Snippets</h1>
        <p className="text-sm text-muted-foreground">
          No active research target yet. Capture a snippet from the extension
          to create your first one.
        </p>
      </div>
    );
  }

  const snippets = await listSnippetsForTarget(tenantId, target.kind, target.id, {
    tagSlug: tagFilter,
  });

  return (
    <div className="p-6 space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Snippets</h1>
        <p className="text-sm text-muted-foreground">
          Evidence captured for{' '}
          <span className="font-medium">{target.label}</span>
          {tagFilter ? (
            <>
              {' '}
              · filtered by tag <code className="px-1 py-0.5 rounded bg-muted">{tagFilter}</code>
            </>
          ) : null}
        </p>
      </header>

      {snippets.length === 0 ? (
        <div className="rounded-md border p-6 text-sm text-muted-foreground">
          No snippets yet for this target. Open the extension, select text on
          any approved site, and click &ldquo;Snip to target&rdquo;.
        </div>
      ) : (
        <ul className="space-y-3">
          {snippets.map((s) => (
            <li
              key={s.causalNodeId}
              className="rounded-md border p-4 space-y-2"
              data-testid="snippet-card"
            >
              <div className="text-sm text-muted-foreground">
                <a
                  href={s.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline hover:no-underline"
                >
                  {s.sourceUrl}
                </a>
                {' · '}
                {new Date(s.createdAt).toLocaleString()}
              </div>
              <div className="text-sm whitespace-pre-wrap">{s.text}</div>
              {s.note ? (
                <div className="text-xs text-muted-foreground italic">
                  Note: {s.note}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-1.5 text-xs">
                {s.tagSlugs.map((t) => (
                  <span
                    key={t}
                    className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                  >
                    {t}
                  </span>
                ))}
                {s.linkedContactIds.length > 0 ? (
                  <span className="px-2 py-0.5 rounded-full bg-accent text-accent-foreground">
                    Mentions {s.linkedContactIds.length}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
