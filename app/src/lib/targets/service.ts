// Research Tools Sprint — WS-4 target state service
//
// Single source of truth for "what target is this session about?" reads and
// writes. Every (app)/** layout calls `getResearchTargetState(ownerId)` which
// lazy-creates the state row on first access and always returns a valid
// ResearchTargetState with `primary_target_id` pointing at the owner's
// `kind='self'` row.
//
// Per ADR-027 + `10-decisions.md` Q4: primary is immutable in v1 and always
// equals the self-target for the requesting user. Secondary is nullable.

import { query } from '../db/client';
import type { ResearchTarget, ResearchTargetState, TargetKind } from './types';

function rowToTarget(row: Record<string, unknown>): ResearchTarget {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    kind: row.kind as TargetKind,
    ownerId: (row.owner_id as string | null) ?? null,
    contactId: (row.contact_id as string | null) ?? null,
    companyId: (row.company_id as string | null) ?? null,
    label: row.label as string,
    pinned: Boolean(row.pinned),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastUsedAt: String(row.last_used_at),
  };
}

function rowToState(row: Record<string, unknown>): ResearchTargetState {
  return {
    tenantId: row.tenant_id as string,
    userId: (row.user_id as string | null) ?? null,
    primaryTargetId: (row.primary_target_id as string | null) ?? null,
    secondaryTargetId: (row.secondary_target_id as string | null) ?? null,
    updatedAt: String(row.updated_at),
  };
}

/**
 * Resolve the default tenant id. Single-tenant local mode — matches the
 * `default` slug seeded in `020-tenant-schema.sql`.
 */
export async function getDefaultTenantId(): Promise<string> {
  const res = await query<{ id: string }>(
    `SELECT id FROM tenants WHERE slug = 'default' LIMIT 1`
  );
  if (!res.rows[0]) {
    throw new Error('Default tenant not found — run migrations');
  }
  return res.rows[0].id;
}

/**
 * Get the current owner profile. Returns null if no owner exists yet. Used by
 * `getResearchTargetState` and the tenant-resolution fallback for scoring.
 */
export async function getCurrentOwnerProfileId(): Promise<string | null> {
  const res = await query<{ id: string }>(
    `SELECT id FROM owner_profiles WHERE is_current = TRUE LIMIT 1`
  );
  return res.rows[0]?.id ?? null;
}

/**
 * Find (or lazy-create) the owner's self-target. Returns `null` if the owner
 * does not exist — callers then fall back to the no-op behavior documented in
 * the "self-target migration" section of ADR-027.
 */
export async function getOrCreateSelfTarget(ownerId: string): Promise<ResearchTarget | null> {
  const existing = await query<Record<string, unknown>>(
    `SELECT * FROM research_targets WHERE owner_id = $1 AND kind = 'self' LIMIT 1`,
    [ownerId]
  );
  if (existing.rows[0]) {
    return rowToTarget(existing.rows[0]);
  }

  const tenantId = await getDefaultTenantId();
  const labelRes = await query<{ label: string | null }>(
    `SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''), 'Self') AS label
     FROM owner_profiles WHERE id = $1`,
    [ownerId]
  );
  const label = labelRes.rows[0]?.label ?? 'Self';

  const inserted = await query<Record<string, unknown>>(
    `INSERT INTO research_targets (tenant_id, kind, owner_id, label)
     VALUES ($1, 'self', $2, $3)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [tenantId, ownerId, label]
  );
  if (inserted.rows[0]) {
    return rowToTarget(inserted.rows[0]);
  }
  // Race: the row was created by a concurrent call. Re-read.
  const reread = await query<Record<string, unknown>>(
    `SELECT * FROM research_targets WHERE owner_id = $1 AND kind = 'self' LIMIT 1`,
    [ownerId]
  );
  return reread.rows[0] ? rowToTarget(reread.rows[0]) : null;
}

/**
 * Read-or-create the per-user research target state. Called by every server
 * component in `(app)/**`. If no self-target exists yet, we create one and
 * seed the state row. Returns null only if no owner_profile exists — then
 * the caller should proceed with legacy behavior (no breadcrumbs, etc.).
 */
export async function getResearchTargetState(
  ownerId?: string
): Promise<ResearchTargetState | null> {
  const resolvedOwnerId = ownerId ?? (await getCurrentOwnerProfileId());
  if (!resolvedOwnerId) return null;

  const tenantId = await getDefaultTenantId();
  const selfTarget = await getOrCreateSelfTarget(resolvedOwnerId);
  if (!selfTarget) return null;

  // Upsert the state row with primary = self-target. We intentionally do not
  // touch secondary if the row already exists. Primary is derived from the
  // owner + self-target join so keeping it in sync is safe.
  const upserted = await query<Record<string, unknown>>(
    `INSERT INTO research_target_state (tenant_id, user_id, primary_target_id, secondary_target_id)
     VALUES ($1, $2, $3, NULL)
     ON CONFLICT (tenant_id, user_id)
       DO UPDATE SET primary_target_id = EXCLUDED.primary_target_id,
                     updated_at = NOW()
     RETURNING *`,
    [tenantId, resolvedOwnerId, selfTarget.id]
  );
  return upserted.rows[0] ? rowToState(upserted.rows[0]) : null;
}

/**
 * Set (or clear) the secondary target for a given owner.
 */
export async function setSecondaryTarget(
  ownerId: string,
  secondaryTargetId: string | null
): Promise<ResearchTargetState | null> {
  // Make sure the state row exists first.
  const state = await getResearchTargetState(ownerId);
  if (!state) return null;

  const updated = await query<Record<string, unknown>>(
    `UPDATE research_target_state
     SET secondary_target_id = $3, updated_at = NOW()
     WHERE tenant_id = $1 AND user_id = $2
     RETURNING *`,
    [state.tenantId, ownerId, secondaryTargetId]
  );
  return updated.rows[0] ? rowToState(updated.rows[0]) : null;
}

/**
 * Fetch a target by id. Null if missing.
 */
export async function getTargetById(id: string): Promise<ResearchTarget | null> {
  const res = await query<Record<string, unknown>>(
    `SELECT * FROM research_targets WHERE id = $1 LIMIT 1`,
    [id]
  );
  return res.rows[0] ? rowToTarget(res.rows[0]) : null;
}

/**
 * Create (or return the existing) target for a contact.
 */
export async function getOrCreateContactTarget(
  contactId: string,
  tenantId: string
): Promise<ResearchTarget> {
  const existing = await query<Record<string, unknown>>(
    `SELECT * FROM research_targets
     WHERE contact_id = $1 AND tenant_id = $2 AND kind = 'contact' LIMIT 1`,
    [contactId, tenantId]
  );
  if (existing.rows[0]) return rowToTarget(existing.rows[0]);

  const labelRes = await query<{ label: string | null }>(
    `SELECT COALESCE(full_name, 'Contact') AS label FROM contacts WHERE id = $1`,
    [contactId]
  );
  const label = labelRes.rows[0]?.label ?? 'Contact';

  const inserted = await query<Record<string, unknown>>(
    `INSERT INTO research_targets (tenant_id, kind, contact_id, label)
     VALUES ($1, 'contact', $2, $3)
     ON CONFLICT (tenant_id, contact_id) WHERE contact_id IS NOT NULL DO NOTHING
     RETURNING *`,
    [tenantId, contactId, label]
  ).catch(async () => {
    // Conflict handling fallback (partial unique index may refuse the ON CONFLICT
    // target in older pg).
    return query<Record<string, unknown>>(
      `SELECT * FROM research_targets
       WHERE contact_id = $1 AND tenant_id = $2 LIMIT 1`,
      [contactId, tenantId]
    );
  });
  return rowToTarget(inserted.rows[0]);
}

/**
 * Create (or return the existing) target for a company.
 */
export async function getOrCreateCompanyTarget(
  companyId: string,
  tenantId: string
): Promise<ResearchTarget> {
  const existing = await query<Record<string, unknown>>(
    `SELECT * FROM research_targets
     WHERE company_id = $1 AND tenant_id = $2 AND kind = 'company' LIMIT 1`,
    [companyId, tenantId]
  );
  if (existing.rows[0]) return rowToTarget(existing.rows[0]);

  const labelRes = await query<{ label: string | null }>(
    `SELECT COALESCE(name, 'Company') AS label FROM companies WHERE id = $1`,
    [companyId]
  );
  const label = labelRes.rows[0]?.label ?? 'Company';

  const inserted = await query<Record<string, unknown>>(
    `INSERT INTO research_targets (tenant_id, kind, company_id, label)
     VALUES ($1, 'company', $2, $3)
     RETURNING *`,
    [tenantId, companyId, label]
  );
  return rowToTarget(inserted.rows[0]);
}

/**
 * Resolve a target row to the underlying entity id used by graph / scoring
 * queries. For 'self' targets this is the `owner_id`, for 'contact' it's
 * `contact_id`, for 'company' it's `company_id`.
 */
export function getTargetEntityId(target: ResearchTarget): string | null {
  if (target.kind === 'self') return target.ownerId;
  if (target.kind === 'contact') return target.contactId;
  if (target.kind === 'company') return target.companyId;
  return null;
}
