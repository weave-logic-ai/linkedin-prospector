-- Research Tools Sprint — WS-1: Parser telemetry
-- Per `07-architecture-and-schema.md` §2.1 and `01-parser-audit.md` §4.2.
-- Retention (Q8/A): raw rows retained 90 days; daily aggregate retained 2 years.
-- Retention cron lands in Phase 2; aggregate table ships here so the rollup
-- has somewhere to land as soon as Phase 1 telemetry writes begin.

-- -------------------------------------------------------------------------
-- parse_field_outcomes — one row per field per parse call
-- -------------------------------------------------------------------------
-- Captures whether a field came out, at what confidence, and via which
-- extraction path. The source column distinguishes primary selector hits
-- from heuristic / fallback hits so we can detect "fallback hiding rot".
CREATE TABLE IF NOT EXISTS parse_field_outcomes (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id),
  capture_id              UUID NOT NULL REFERENCES page_cache(id) ON DELETE CASCADE,
  page_type               TEXT NOT NULL,
  parser_version          TEXT NOT NULL,
  selector_config_version INT NOT NULL,
  field_name              TEXT NOT NULL,
  value_present           BOOLEAN NOT NULL,
  confidence              REAL,
  -- Extraction path. One of:
  --   'selector'           — matched a CSS selector from selector_configs
  --   'heuristic'          — matched a heuristic regex declared in the config
  --   'content-heuristic'  — parser-embedded content heuristic (e.g. title tag)
  --   'title-tag'          — extracted from <title>
  --   'url-slug'           — extracted from the URL path
  --   'fallback'           — matched a fallback strategy from the registry
  source                  TEXT NOT NULL,
  selector_used           TEXT,
  selector_index          INT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-parser, per-field, time-windowed yield queries (the main trend read path).
CREATE INDEX IF NOT EXISTS ix_pfo_page_field_time
  ON parse_field_outcomes(page_type, field_name, created_at DESC);

-- Capture drill-down: "show me every field outcome for this capture".
CREATE INDEX IF NOT EXISTS ix_pfo_capture
  ON parse_field_outcomes(capture_id);

-- Tenant-scoped listing + retention sweep support.
CREATE INDEX IF NOT EXISTS ix_pfo_tenant_time
  ON parse_field_outcomes(tenant_id, created_at DESC);

-- -------------------------------------------------------------------------
-- parse_field_outcomes_daily — rolled-up aggregates (Q8/A)
-- -------------------------------------------------------------------------
-- One row per (tenant, day, page_type, field_name). Populated by the
-- nightly rollup job that ships in Phase 2. Retained 2 years for trend
-- analysis after raw rows age out of parse_field_outcomes.
CREATE TABLE IF NOT EXISTS parse_field_outcomes_daily (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  day             DATE NOT NULL,
  page_type       TEXT NOT NULL,
  field_name      TEXT NOT NULL,
  parser_version  TEXT NOT NULL,
  n_samples       INTEGER NOT NULL DEFAULT 0,
  n_present       INTEGER NOT NULL DEFAULT 0,
  avg_confidence  REAL,
  -- Breakdown of how the field was extracted on this day. Keys are the
  -- `source` values from parse_field_outcomes; values are counts.
  source_breakdown JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_pfod_bucket UNIQUE (tenant_id, day, page_type, field_name, parser_version)
);

CREATE INDEX IF NOT EXISTS ix_pfod_tenant_day
  ON parse_field_outcomes_daily(tenant_id, day DESC);

CREATE INDEX IF NOT EXISTS ix_pfod_field_day
  ON parse_field_outcomes_daily(page_type, field_name, day DESC);

CREATE TRIGGER trg_parse_field_outcomes_daily_updated_at
  BEFORE UPDATE ON parse_field_outcomes_daily
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -------------------------------------------------------------------------
-- parser_regression_reports — user-flagged parse misses (WS-2 Sidebar feeds this)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parser_regression_reports (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID NOT NULL REFERENCES tenants(id),
  capture_id             UUID NOT NULL REFERENCES page_cache(id) ON DELETE CASCADE,
  reporter_user_id       UUID,
  page_type              TEXT NOT NULL,
  dom_path               TEXT NOT NULL,
  text_preview           TEXT,
  user_note              TEXT,
  -- Relative path under data/parser-fixtures/_pending where the redacted
  -- HTML fragment was written. Null until the fixture-capture worker runs.
  redacted_fragment_path TEXT,
  github_issue_url       TEXT,
  status                 TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'promoted', 'dismissed')),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_prr_tenant_status
  ON parser_regression_reports(tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_prr_capture
  ON parser_regression_reports(capture_id);

CREATE TRIGGER trg_parser_regression_reports_updated_at
  BEFORE UPDATE ON parser_regression_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -------------------------------------------------------------------------
-- selector_config_audit — append-only log of selector_configs changes
-- -------------------------------------------------------------------------
-- Gives us git-visible provenance for DB-resident selector changes.
-- `diff` is the structural edit captured at write time: { added, removed, changed }.
CREATE TABLE IF NOT EXISTS selector_config_audit (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id),
  selector_config_id UUID NOT NULL REFERENCES selector_configs(id) ON DELETE CASCADE,
  actor_id           UUID,
  change_type        TEXT NOT NULL
    CHECK (change_type IN ('create', 'update', 'deactivate')),
  change_reason      TEXT,
  diff               JSONB NOT NULL DEFAULT '{}',
  effective_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_sca_config_time
  ON selector_config_audit(selector_config_id, effective_at DESC);

CREATE INDEX IF NOT EXISTS ix_sca_tenant_time
  ON selector_config_audit(tenant_id, effective_at DESC);
