// Tenant resolution for the snippets module.
//
// Phase 1 Track C originally duplicated `getDefaultTenantId` here so the
// snippet service would not take a compile-time dependency on Track B's
// targets module. Phase 1.5 consolidated both callers onto a single
// canonical implementation in `@/lib/db/tenants`; this module now simply
// re-exports it so existing imports keep working.

export { getDefaultTenantId } from '../db/tenants';
