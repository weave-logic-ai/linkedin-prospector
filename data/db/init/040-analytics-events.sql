-- Research Tools Sprint — WS-2 Phase 2 Track D: analytics_events
-- Per `08-phased-delivery.md` §4.1 analytics events, §11 "telemetry the sidebar
-- itself emits", and `02-visibility-and-feedback.md` §11.
--
-- Generic append-only event table. Each row is one product-analytics event
-- (e.g. parse_panel_viewed, capture_diff_opened, unmatched_flagged,
-- regression_run). Payload is JSONB — we keep the table schema narrow and
-- let callers shape their own per-event fields under `properties`.
--
-- Tenant-scoped via get_current_tenant_id(); no PII expected in properties
-- (callers are responsible for staying on the policy).

CREATE TABLE IF NOT EXISTS analytics_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  user_id     UUID,
  -- Event name. Constrained to snake_case to keep the namespace clean.
  event       TEXT NOT NULL CHECK (event ~ '^[a-z][a-z0-9_]*$'),
  -- Free-form per-event payload. Keep small; no raw HTML, no emails.
  properties  JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_ae_tenant_created
  ON analytics_events(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_ae_event_created
  ON analytics_events(event, created_at DESC);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_analytics_events ON analytics_events
  FOR ALL USING (tenant_id = get_current_tenant_id());

CREATE POLICY admin_bypass_analytics_events ON analytics_events
  FOR ALL USING (is_super_admin());
