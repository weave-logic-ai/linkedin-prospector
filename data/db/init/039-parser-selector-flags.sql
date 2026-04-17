-- Research Tools Sprint — WS-2 Phase 2 Track D: parser_selector_flags
-- Per `08-phased-delivery.md` §4.1 and `02-visibility-and-feedback.md` §§4.4, 9.
--
-- User-triggered "flag for selector miss" events raised from the Unmatched DOM
-- panel in the sidebar. Separate from `parser_regression_reports` (migration
-- 033): that table is for the full regression-report route; this table is
-- for the lightweight per-unmatched-region flag the user clicks in the
-- sidebar. Both feed the parser feedback loop; this one has a smaller blast
-- radius (one DOM region, not a whole capture).

CREATE TABLE IF NOT EXISTS parser_selector_flags (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id),
  capture_id         UUID NOT NULL REFERENCES page_cache(id) ON DELETE CASCADE,
  page_type          TEXT NOT NULL,
  dom_path           TEXT NOT NULL,
  -- Redacted excerpt of the DOM region the user flagged. Capped at 4KB per
  -- `08-phased-delivery.md` §4.1 "excerpt capped at 4KB".
  dom_html_excerpt   TEXT NOT NULL,
  -- First ~160 chars of the text the user saw (mirror of UnmatchedDomEntry).
  text_preview       TEXT,
  user_note          TEXT,
  reporter_user_id   UUID,
  resolved_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_excerpt_size CHECK (octet_length(dom_html_excerpt) <= 4096)
);

CREATE INDEX IF NOT EXISTS ix_psf_tenant_created
  ON parser_selector_flags(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_psf_capture
  ON parser_selector_flags(capture_id);

CREATE INDEX IF NOT EXISTS ix_psf_unresolved
  ON parser_selector_flags(tenant_id, created_at DESC)
  WHERE resolved_at IS NULL;

-- RLS — tenant isolation mirrors the 037-research-rls.sql pattern.
ALTER TABLE parser_selector_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_parser_selector_flags ON parser_selector_flags
  FOR ALL USING (tenant_id = get_current_tenant_id());

CREATE POLICY admin_bypass_parser_selector_flags ON parser_selector_flags
  FOR ALL USING (is_super_admin());
