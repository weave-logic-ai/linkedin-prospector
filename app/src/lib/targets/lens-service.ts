// Research Tools Sprint — WS-4 Phase 1.5 + WS-4 polish: per-target ICP
// plumbing via lenses, now backed by migration 045 columns.
//
// A "lens" is a saved view of a research target — a (target, config) bundle
// stored in `research_lenses` (schema: `data/db/init/035-targets-schema.sql`).
// Phase 1.5 threads per-target ICP selection through the scoring pipeline so
// that the same contact can score differently depending on which lens is
// active for the target being researched.
//
// Migration 045 — what changed and why
// ---------------------------------------------------------------------------
// Phase 1.5 originally shipped against migration 035 as landed, which did
// NOT have:
//   - `research_target_icps.lens_id`       (target ↔ lens ↔ ICP triple)
//   - `research_target_state.last_used_lens_id` (per-user active lens)
//
// The Phase 1.5 workaround stored the ICP-for-lens mapping inside
// `research_lenses.config.icpProfileIds` JSONB, and used the row's
// `is_default` bit as a stand-in for "which lens is active right now."
// That workaround had two rough edges:
//
//   1. Activating a lens meant a transactional `is_default = FALSE` pass
//      across every sibling lens for the target. That's a write per row for
//      a per-user preference — the sibling rows never actually changed
//      meaning.
//   2. "Active lens" was global-per-target rather than per-user. Two users
//      researching the same target could clobber each other's active lens.
//
// Migration 045 fixes both by introducing:
//   - `research_target_icps.lens_id UUID NULL REFERENCES research_lenses(id)`
//     — a real target ↔ lens ↔ ICP junction. Back-filled from each target's
//     `is_default` lens so existing seed-lenses continue to resolve. Not
//     yet used on the read path (Phase 1.5 `config.icpProfileIds` stays the
//     source of truth until all callers migrate), but exposed so downstream
//     consumers can opt in.
//   - `research_target_state.last_used_lens_id UUID NULL REFERENCES
//     research_lenses(id)` — the canonical "which lens is active for this
//     user on this target" pointer.
//
// After 045 the `is_default` column on `research_lenses` is retained as a
// hint ("primary lens for this target") but is NO LONGER used for the
// active-lens read path. Reads now go:
//
//   1. `research_target_state.last_used_lens_id` for the current owner.
//      Must match a lens whose `primary_target_id` is the target we're
//      scoping; otherwise fall through.
//   2. The target's `is_default = TRUE` lens (first row, oldest-wins).
//   3. The oldest non-deleted lens for the target.
//
// Writes (`activateLensForTarget`) now update `last_used_lens_id` on the
// state row. `is_default` is still opportunistically set — if the target
// has no default lens yet, the activated lens becomes the default (so the
// fallback path keeps working for anonymous / state-less callers). Existing
// sibling `is_default = TRUE` rows are left alone.

import { query, transaction } from '../db/client';
import type { PoolClient } from 'pg';
import type { IcpProfile, IcpCriteria } from '../scoring/types';

export interface ResearchLens {
  id: string;
  tenantId: string;
  userId: string | null;
  name: string;
  primaryTargetId: string | null;
  secondaryTargetId: string | null;
  config: Record<string, unknown>;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  /** Populated by migration 044 — non-null means the lens was soft-deleted. */
  deletedAt: string | null;
}

interface LensConfigWithIcps {
  icpProfileIds?: string[];
  [key: string]: unknown;
}

function rowToLens(row: Record<string, unknown>): ResearchLens {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    userId: (row.user_id as string | null) ?? null,
    name: row.name as string,
    primaryTargetId: (row.primary_target_id as string | null) ?? null,
    secondaryTargetId: (row.secondary_target_id as string | null) ?? null,
    config: (row.config as Record<string, unknown>) ?? {},
    isDefault: Boolean(row.is_default),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deletedAt: row.deleted_at ? String(row.deleted_at) : null,
  };
}

function mapIcpRow(row: Record<string, unknown>): IcpProfile {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    isActive: Boolean(row.is_active),
    criteria: (row.criteria as IcpCriteria) ?? {},
    weightOverrides: (row.weight_overrides as Record<string, number>) ?? {},
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/**
 * List every non-deleted lens attached to a target as `primary_target_id`,
 * ordered default-first then by creation time.
 *
 * Soft-deleted lenses (deleted_at IS NOT NULL) are filtered out. Callers
 * that need the soft-deleted row (e.g. the deep-link "this lens was
 * deleted" banner path) should use `getLensById` which returns any row
 * regardless of delete state.
 */
export async function listLensesForTarget(targetId: string): Promise<ResearchLens[]> {
  const res = await query<Record<string, unknown>>(
    `SELECT * FROM research_lenses
     WHERE primary_target_id = $1 AND deleted_at IS NULL
     ORDER BY is_default DESC, created_at ASC`,
    [targetId]
  );
  return res.rows.map(rowToLens);
}

/**
 * Fetch a single lens by id regardless of soft-delete state. Used by the
 * deep-link deserializer so we can render a "this lens was deleted" banner
 * instead of a 404.
 */
export async function getLensById(lensId: string): Promise<ResearchLens | null> {
  const res = await query<Record<string, unknown>>(
    `SELECT * FROM research_lenses WHERE id = $1 LIMIT 1`,
    [lensId]
  );
  return res.rows[0] ? rowToLens(res.rows[0]) : null;
}

/**
 * Soft-delete a lens. Sets deleted_at on the row without removing it, so
 * shared URLs can distinguish "this lens never existed" (404) from "this
 * lens was deleted" (banner + fall through to default).
 *
 * If the target-scoped lens being deleted was the active default, we do NOT
 * promote a sibling — activation is an explicit user action. The UI simply
 * renders the target's default view until the user activates a new lens.
 */
export async function softDeleteLens(
  targetId: string,
  lensId: string
): Promise<ResearchLens | null> {
  const res = await query<Record<string, unknown>>(
    `UPDATE research_lenses
     SET deleted_at = NOW(), is_default = FALSE, updated_at = NOW()
     WHERE id = $1 AND primary_target_id = $2 AND deleted_at IS NULL
     RETURNING *`,
    [lensId, targetId]
  );
  return res.rows[0] ? rowToLens(res.rows[0]) : null;
}

/**
 * Read the current owner's `research_target_state.last_used_lens_id`.
 * Isolated so `getActiveLensForTarget` does not need to know how to resolve
 * owner/user from the environment — it just gets the pointer or null.
 *
 * Returns null when there is no current owner profile, no state row, or
 * the column is NULL.
 */
async function readLastUsedLensIdForCurrentOwner(): Promise<string | null> {
  const res = await query<{ last_used_lens_id: string | null }>(
    `SELECT last_used_lens_id
     FROM research_target_state
     WHERE user_id = (
       SELECT id FROM owner_profiles WHERE is_current = TRUE LIMIT 1
     )
     LIMIT 1`
  );
  return res.rows[0]?.last_used_lens_id ?? null;
}

/**
 * Resolve the "active" lens for a target. Resolution order (migration 045):
 *
 *   1. `research_target_state.last_used_lens_id` for the current owner.
 *      Must be a non-deleted lens whose `primary_target_id` matches the
 *      argument — if not, we fall through (prevents a stale pointer from
 *      another target leaking in).
 *   2. The target's `is_default = TRUE` lens (oldest-wins on tie).
 *   3. The oldest non-deleted lens attached to the target.
 *
 * Returns null if the target has no lenses at all.
 */
export async function getActiveLensForTarget(targetId: string): Promise<ResearchLens | null> {
  const lastUsedLensId = await readLastUsedLensIdForCurrentOwner();
  if (lastUsedLensId) {
    const res = await query<Record<string, unknown>>(
      `SELECT * FROM research_lenses
       WHERE id = $1 AND primary_target_id = $2 AND deleted_at IS NULL
       LIMIT 1`,
      [lastUsedLensId, targetId]
    );
    if (res.rows[0]) {
      return rowToLens(res.rows[0]);
    }
    // Stale pointer — fall through to the is_default / oldest path below.
  }

  // Fallback: ORDER BY is_default DESC, created_at ASC picks the default
  // first and the oldest lens otherwise.
  const lenses = await listLensesForTarget(targetId);
  return lenses[0] ?? null;
}

/**
 * Return the ICP profiles associated with the target's currently-active
 * lens. Lens ↔ ICP mapping is stored as `config.icpProfileIds: string[]`
 * (the Phase 1.5 workaround — migration 045 introduces
 * `research_target_icps.lens_id` but the read path continues to use the
 * JSONB config until all writers migrate).
 *
 * Returns `[]` if the target has no lens, the lens has no ICP ids, or the
 * referenced ICPs are all inactive. Callers must use that empty-array result
 * as a signal to fall back to the owner-default ICP list.
 */
export async function getActiveLensIcps(targetId: string): Promise<IcpProfile[]> {
  const lens = await getActiveLensForTarget(targetId);
  if (!lens) return [];

  const config = lens.config as LensConfigWithIcps;
  const ids = Array.isArray(config.icpProfileIds)
    ? config.icpProfileIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  if (ids.length === 0) return [];

  const res = await query<Record<string, unknown>>(
    `SELECT id, name, description, is_active, criteria, weight_overrides,
            created_at, updated_at
     FROM icp_profiles
     WHERE id = ANY($1::uuid[]) AND is_active = TRUE
     ORDER BY name`,
    [ids]
  );
  return res.rows.map(mapIcpRow);
}

/**
 * Create a lens for a target. The lens's ICP association is stored on the
 * `config` JSONB as `icpProfileIds`. First lens for a target is automatically
 * marked default.
 */
export async function createLensForTarget(input: {
  targetId: string;
  tenantId: string;
  name: string;
  userId?: string | null;
  icpProfileIds?: string[];
  secondaryTargetId?: string | null;
  configExtras?: Record<string, unknown>;
}): Promise<ResearchLens> {
  const existing = await listLensesForTarget(input.targetId);
  const isDefault = existing.length === 0; // first lens wins default

  const config: LensConfigWithIcps = {
    ...(input.configExtras ?? {}),
    icpProfileIds: input.icpProfileIds ?? [],
  };

  const res = await query<Record<string, unknown>>(
    `INSERT INTO research_lenses
       (tenant_id, user_id, name, primary_target_id, secondary_target_id,
        config, is_default)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      input.tenantId,
      input.userId ?? null,
      input.name,
      input.targetId,
      input.secondaryTargetId ?? null,
      JSON.stringify(config),
      isDefault,
    ]
  );
  return rowToLens(res.rows[0]);
}

/**
 * Activate a lens for a target — after migration 045 this writes the
 * pointer to `research_target_state.last_used_lens_id` for the current
 * owner instead of flipping `is_default` across every sibling lens.
 *
 * `is_default` is retained as a "primary lens" hint and is opportunistically
 * promoted only when the target currently has NO default lens (keeps the
 * fallback path in `getActiveLensForTarget` working for callers without
 * owner context, like background jobs). Existing sibling `is_default = TRUE`
 * rows are left untouched.
 *
 * Returns the activated lens row, or null when the lens does not belong to
 * the target.
 */
export async function activateLensForTarget(
  targetId: string,
  lensId: string
): Promise<ResearchLens | null> {
  return transaction(async (client: PoolClient) => {
    // 1. Verify the lens belongs to this target and is not soft-deleted.
    const check = await client.query<Record<string, unknown>>(
      `SELECT * FROM research_lenses
       WHERE id = $1 AND primary_target_id = $2 AND deleted_at IS NULL
       LIMIT 1`,
      [lensId, targetId]
    );
    if (check.rows.length === 0) return null;

    // 2. Update the per-user state row so the read path picks this lens up.
    //    Single-tenant v1 — owner_profiles.is_current=TRUE is the active user.
    await client.query(
      `UPDATE research_target_state
       SET last_used_lens_id = $1, updated_at = NOW()
       WHERE user_id = (
         SELECT id FROM owner_profiles WHERE is_current = TRUE LIMIT 1
       )`,
      [lensId]
    );

    // 3. Opportunistic is_default hint: if nothing else is the default yet,
    //    mark this one so fallback callers (anonymous / state-less) keep
    //    resolving. Do not clobber an existing default.
    const existingDefault = await client.query<{ id: string }>(
      `SELECT id FROM research_lenses
       WHERE primary_target_id = $1 AND is_default = TRUE AND deleted_at IS NULL
       LIMIT 1`,
      [targetId]
    );
    if (existingDefault.rows.length === 0) {
      const promoted = await client.query<Record<string, unknown>>(
        `UPDATE research_lenses
         SET is_default = TRUE, updated_at = NOW()
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING *`,
        [lensId]
      );
      if (promoted.rows[0]) return rowToLens(promoted.rows[0]);
    }

    // Return the already-loaded row (no column-level changes).
    return rowToLens(check.rows[0]);
  });
}
