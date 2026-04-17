// Local tenant resolution for the snippets module.
//
// Track C ships independently of Track B (targets). Track B introduces a
// shared `@/lib/targets/service.ts` that exports `getDefaultTenantId`; in
// Track C we duplicate only the one helper we need so the snippet service
// does not take a compile-time dependency on Track B's module. When Track B
// lands on main, this file stays — Track B callers use their own module,
// Track C callers keep using this one. The helper resolves the same seeded
// `tenants.slug='default'` row either way (see `020-tenant-schema.sql`).

import { query } from '../db/client';

export async function getDefaultTenantId(): Promise<string> {
  const res = await query<{ id: string }>(
    `SELECT id FROM tenants WHERE slug = 'default' LIMIT 1`
  );
  if (!res.rows[0]) {
    throw new Error('Default tenant not found — run migrations');
  }
  return res.rows[0].id;
}
