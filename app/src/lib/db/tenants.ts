// Canonical tenant helpers — single source of truth.
//
// Phase 1.5 consolidation follow-up from Track B's audit: previously both
// `@/lib/snippets/tenant.ts` and `@/lib/targets/service.ts` shipped their own
// `getDefaultTenantId` helper against the same `tenants.slug='default'` row.
// This file owns the canonical implementation; the other two re-export it
// so existing imports keep working without call-site churn.

import { query } from './client';

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
