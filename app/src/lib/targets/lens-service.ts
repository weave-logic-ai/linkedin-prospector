// Research Tools Sprint — WS-4 Phase 1.5: per-target ICP plumbing via lenses.
//
// A "lens" is a saved view of a research target — a (target, config) bundle
// stored in `research_lenses` (schema: `data/db/init/035-targets-schema.sql`).
// Phase 1.5 threads per-target ICP selection through the scoring pipeline so
// that the same contact can score differently depending on which lens is
// active for the target being researched.
//
// Design notes / schema caveat
// ---------------------------------------------------------------------------
// The sprint scope (.planning/08-phased-delivery.md §3.4) describes a
// `research_target_icps (target_id, lens_id, icp_profile_id, weight)` row and
// a `research_target_state.last_used_lens_id` column. Migration 035 as landed
// gives us:
//   - `research_target_icps (target_id, icp_profile_id, is_default)` — NO
//     lens_id, NO weight.
//   - `research_lenses (id, tenant_id, user_id, name, primary_target_id,
//     secondary_target_id, config JSONB, is_default, ...)` — no direct join
//     to icp_profiles.
//   - `research_target_state (primary_target_id, secondary_target_id, ...)`
//     — NO last_used_lens_id column.
//
// Constraint from the task: "Do NOT modify research_target_icps schema — use
// what migration 035 gives you." So this module takes the following shape:
//
//   1. Lens ↔ ICP association lives in `research_lenses.config` JSONB as
//      `{ "icpProfileIds": [uuid, ...] }`. The junction table
//      `research_target_icps` is left alone; existing seed-lenses.ts writes
//      that continue to work for the "list ICPs attached to a target" view
//      but the active-lens scoping reads from the lens's config.
//
//   2. "Active lens" for a target = the `research_lenses` row for that
//      primary target where `is_default = TRUE`; falling back to the oldest
//      `created_at` row for that target if none is marked default. This maps
//      to "last_used_lens_id if set, else the single seeded lens" in the
//      task description.
//
//   3. "Activate a lens" = flip `is_default` on that row to TRUE (and set
//      all other lenses for the same target to FALSE in the same
//      transaction). This mirrors the "update last_used_lens_id" intent
//      without requiring a schema change.
//
// When the lens-scoped ICP list is empty (or the target has no lenses), the
// scoring pipeline falls back to `getActiveIcpProfiles()` — the owner-default
// list — preserving today's behavior for all existing callers. Nothing
// changes until a lens is created and activated.

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
 * List every lens attached to a target as `primary_target_id`, ordered
 * default-first then by creation time.
 */
export async function listLensesForTarget(targetId: string): Promise<ResearchLens[]> {
  const res = await query<Record<string, unknown>>(
    `SELECT * FROM research_lenses
     WHERE primary_target_id = $1
     ORDER BY is_default DESC, created_at ASC`,
    [targetId]
  );
  return res.rows.map(rowToLens);
}

/**
 * Resolve the "active" lens for a target: the `is_default=true` row first;
 * otherwise the oldest lens attached to the target. Returns null if the
 * target has no lenses.
 */
export async function getActiveLensForTarget(targetId: string): Promise<ResearchLens | null> {
  const lenses = await listLensesForTarget(targetId);
  return lenses[0] ?? null;
}

/**
 * Return the ICP profiles associated with the target's currently-active
 * lens. Lens ↔ ICP mapping is stored as `config.icpProfileIds: string[]`
 * (see module-level design notes).
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
 * Mark the specified lens as the default for its target, clearing the flag
 * on every sibling lens in the same transaction. This is the Phase 1.5
 * stand-in for writing `research_target_state.last_used_lens_id` (the
 * column does not exist on 035; see module-level design notes).
 *
 * Returns the updated lens, or null if no lens with that id exists for the
 * given target.
 */
export async function activateLensForTarget(
  targetId: string,
  lensId: string
): Promise<ResearchLens | null> {
  return transaction(async (client: PoolClient) => {
    const check = await client.query(
      `SELECT id FROM research_lenses WHERE id = $1 AND primary_target_id = $2`,
      [lensId, targetId]
    );
    if (check.rows.length === 0) return null;

    await client.query(
      `UPDATE research_lenses SET is_default = FALSE, updated_at = NOW()
       WHERE primary_target_id = $1 AND id <> $2`,
      [targetId, lensId]
    );
    const res = await client.query(
      `UPDATE research_lenses SET is_default = TRUE, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [lensId]
    );
    return res.rows[0] ? rowToLens(res.rows[0]) : null;
  });
}
