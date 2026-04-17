-- Research Tools Sprint: Row-Level Security for all WS-1/3/4/5 tables
-- Mirrors the pattern from 030-ecc-rls.sql.
--
-- Tables with a direct `tenant_id` column: use the simple tenant-isolation
-- policy + an admin-bypass policy.
-- Tables without a `tenant_id` column (junctions like source_record_entities,
-- research_target_icps): use a join-based policy that checks the parent row's
-- tenant_id.

-- =========================================================================
-- Enable RLS
-- =========================================================================
ALTER TABLE parse_field_outcomes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE parse_field_outcomes_daily   ENABLE ROW LEVEL SECURITY;
ALTER TABLE parser_regression_reports    ENABLE ROW LEVEL SECURITY;
ALTER TABLE selector_config_audit        ENABLE ROW LEVEL SECURITY;

ALTER TABLE snippet_blobs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE snippet_tags                 ENABLE ROW LEVEL SECURITY;

ALTER TABLE research_targets             ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_target_state        ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_target_icps         ENABLE ROW LEVEL SECURITY;
ALTER TABLE target_history               ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_lenses              ENABLE ROW LEVEL SECURITY;

ALTER TABLE source_records               ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_record_entities       ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_feeds                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_ingestion_jobs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_type_weights          ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_field_values          ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- WS-1 parser telemetry
-- =========================================================================
CREATE POLICY tenant_isolation_parse_field_outcomes ON parse_field_outcomes
  FOR ALL USING (tenant_id = get_current_tenant_id());
CREATE POLICY admin_bypass_parse_field_outcomes ON parse_field_outcomes
  FOR ALL USING (is_super_admin());

CREATE POLICY tenant_isolation_parse_field_outcomes_daily ON parse_field_outcomes_daily
  FOR ALL USING (tenant_id = get_current_tenant_id());
CREATE POLICY admin_bypass_parse_field_outcomes_daily ON parse_field_outcomes_daily
  FOR ALL USING (is_super_admin());

CREATE POLICY tenant_isolation_parser_regression_reports ON parser_regression_reports
  FOR ALL USING (tenant_id = get_current_tenant_id());
CREATE POLICY admin_bypass_parser_regression_reports ON parser_regression_reports
  FOR ALL USING (is_super_admin());

CREATE POLICY tenant_isolation_selector_config_audit ON selector_config_audit
  FOR ALL USING (tenant_id = get_current_tenant_id());
CREATE POLICY admin_bypass_selector_config_audit ON selector_config_audit
  FOR ALL USING (is_super_admin());

-- =========================================================================
-- WS-3 snippets
-- =========================================================================
CREATE POLICY tenant_isolation_snippet_blobs ON snippet_blobs
  FOR ALL USING (tenant_id = get_current_tenant_id());
CREATE POLICY admin_bypass_snippet_blobs ON snippet_blobs
  FOR ALL USING (is_super_admin());

CREATE POLICY tenant_isolation_snippet_tags ON snippet_tags
  FOR ALL USING (tenant_id = get_current_tenant_id());
CREATE POLICY admin_bypass_snippet_tags ON snippet_tags
  FOR ALL USING (is_super_admin());

-- =========================================================================
-- WS-4 targets
-- =========================================================================
CREATE POLICY tenant_isolation_research_targets ON research_targets
  FOR ALL USING (tenant_id = get_current_tenant_id());
CREATE POLICY admin_bypass_research_targets ON research_targets
  FOR ALL USING (is_super_admin());

CREATE POLICY tenant_isolation_research_target_state ON research_target_state
  FOR ALL USING (tenant_id = get_current_tenant_id());
CREATE POLICY admin_bypass_research_target_state ON research_target_state
  FOR ALL USING (is_super_admin());

CREATE POLICY tenant_isolation_target_history ON target_history
  FOR ALL USING (tenant_id = get_current_tenant_id());
CREATE POLICY admin_bypass_target_history ON target_history
  FOR ALL USING (is_super_admin());

CREATE POLICY tenant_isolation_research_lenses ON research_lenses
  FOR ALL USING (tenant_id = get_current_tenant_id());
CREATE POLICY admin_bypass_research_lenses ON research_lenses
  FOR ALL USING (is_super_admin());

-- research_target_icps has no direct tenant_id — isolate via parent target.
CREATE POLICY tenant_isolation_research_target_icps ON research_target_icps
  FOR ALL USING (target_id IN (
    SELECT id FROM research_targets WHERE tenant_id = get_current_tenant_id()
  ));
CREATE POLICY admin_bypass_research_target_icps ON research_target_icps
  FOR ALL USING (is_super_admin());

-- =========================================================================
-- WS-5 sources
-- =========================================================================
CREATE POLICY tenant_isolation_source_records ON source_records
  FOR ALL USING (tenant_id = get_current_tenant_id());
CREATE POLICY admin_bypass_source_records ON source_records
  FOR ALL USING (is_super_admin());

CREATE POLICY tenant_isolation_source_feeds ON source_feeds
  FOR ALL USING (tenant_id = get_current_tenant_id());
CREATE POLICY admin_bypass_source_feeds ON source_feeds
  FOR ALL USING (is_super_admin());

CREATE POLICY tenant_isolation_source_ingestion_jobs ON source_ingestion_jobs
  FOR ALL USING (tenant_id = get_current_tenant_id());
CREATE POLICY admin_bypass_source_ingestion_jobs ON source_ingestion_jobs
  FOR ALL USING (is_super_admin());

CREATE POLICY tenant_isolation_source_type_weights ON source_type_weights
  FOR ALL USING (tenant_id = get_current_tenant_id());
CREATE POLICY admin_bypass_source_type_weights ON source_type_weights
  FOR ALL USING (is_super_admin());

CREATE POLICY tenant_isolation_source_field_values ON source_field_values
  FOR ALL USING (tenant_id = get_current_tenant_id());
CREATE POLICY admin_bypass_source_field_values ON source_field_values
  FOR ALL USING (is_super_admin());

-- source_record_entities has no direct tenant_id — isolate via parent record.
CREATE POLICY tenant_isolation_source_record_entities ON source_record_entities
  FOR ALL USING (source_record_id IN (
    SELECT id FROM source_records WHERE tenant_id = get_current_tenant_id()
  ));
CREATE POLICY admin_bypass_source_record_entities ON source_record_entities
  FOR ALL USING (is_super_admin());
