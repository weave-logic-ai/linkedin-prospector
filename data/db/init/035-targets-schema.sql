-- Research Tools Sprint — WS-4: Targets + target state + lenses
-- Per `07-architecture-and-schema.md` §2.3 and `04-targets-and-graph.md`.
-- User decisions reflected here (`10-decisions.md`):
--   Q1  — one `kind='self'` row per owner_profile; no multi-self semantics.
--   Q4  — primary = self, immutable for v1; secondary is the UI-centered focus.
--   Q10 — per-user `research_mode_enabled` flag lives on owner_profiles (we do
--         not have a per-user settings table today; owner_profiles is the
--         closest equivalent the app reads on every page load).

-- -------------------------------------------------------------------------
-- Pre-existing table additions (per arch doc §1)
-- -------------------------------------------------------------------------

-- page_cache gains a `source` column so Wayback-replayed captures can be
-- distinguished from live LinkedIn captures. Defaults to 'linkedin' so no
-- existing rows change meaning.
ALTER TABLE page_cache
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'linkedin';

CREATE INDEX IF NOT EXISTS ix_page_cache_source ON page_cache(source);

-- contacts gains last_parser_version so we can re-parse only contacts touched
-- by a known-bad parser version after a selector fix (WS-1 §4.5).
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS last_parser_version TEXT;

-- companies gains CIK for EDGAR matching (WS-5 §5.3).
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS cik TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_companies_cik
  ON companies(cik) WHERE cik IS NOT NULL;

-- owner_profiles gains research_mode_enabled (Q10). Per-user feature toggle;
-- the suggestion engine may nudge the user to flip it on (Phase 5).
ALTER TABLE owner_profiles
  ADD COLUMN IF NOT EXISTS research_mode_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- -------------------------------------------------------------------------
-- research_targets — first-class "what is this research session about"
-- -------------------------------------------------------------------------
-- Exactly one of owner_id / contact_id / company_id is non-null (chk constraint).
-- The kind column is redundant with "which FK is set" but we carry it anyway
-- so queries can filter/group by kind without three-way joins.
--
-- NOTE (Q4): v1 locks primary = self; migration seeds one row per owner_profile
-- and 035b... (no, there is no secondary state yet) writes research_target_state
-- below. Swapping primary away from self is a future-sprint ADR; schema allows
-- it but application policy forbids it for now. The chk_target_kind_match
-- CHECK here is the data-integrity backstop, not the policy enforcement.
CREATE TABLE IF NOT EXISTS research_targets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  kind         TEXT NOT NULL CHECK (kind IN ('self', 'contact', 'company')),
  owner_id     UUID REFERENCES owner_profiles(id) ON DELETE SET NULL,
  contact_id   UUID REFERENCES contacts(id)       ON DELETE SET NULL,
  company_id   UUID REFERENCES companies(id)      ON DELETE SET NULL,
  label        TEXT NOT NULL,
  pinned       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_target_exactly_one CHECK (
    (CASE WHEN owner_id   IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN contact_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN company_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  ),
  CONSTRAINT chk_target_kind_match CHECK (
    (kind = 'self'    AND owner_id   IS NOT NULL) OR
    (kind = 'contact' AND contact_id IS NOT NULL) OR
    (kind = 'company' AND company_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS ix_targets_tenant_lastused
  ON research_targets(tenant_id, last_used_at DESC);

CREATE INDEX IF NOT EXISTS ix_targets_tenant_kind
  ON research_targets(tenant_id, kind);

-- Prevent duplicate targets per subject: one target per (tenant, owner_profile),
-- per (tenant, contact), per (tenant, company). Partial unique indexes so only
-- the relevant FK participates.
CREATE UNIQUE INDEX IF NOT EXISTS uq_target_owner
  ON research_targets(tenant_id, owner_id)   WHERE owner_id   IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_target_contact
  ON research_targets(tenant_id, contact_id) WHERE contact_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_target_company
  ON research_targets(tenant_id, company_id) WHERE company_id IS NOT NULL;

CREATE TRIGGER trg_research_targets_updated_at
  BEFORE UPDATE ON research_targets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -------------------------------------------------------------------------
-- research_target_state — per-user current (primary, secondary)
-- -------------------------------------------------------------------------
-- Primary is always the self-target in v1 (Q4). Secondary is the subject
-- the UI re-centers around when the user picks a comparison focus.
CREATE TABLE IF NOT EXISTS research_target_state (
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  user_id             UUID,
  primary_target_id   UUID REFERENCES research_targets(id) ON DELETE SET NULL,
  secondary_target_id UUID REFERENCES research_targets(id) ON DELETE SET NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TRIGGER trg_research_target_state_updated_at
  BEFORE UPDATE ON research_target_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -------------------------------------------------------------------------
-- research_target_icps — M:N between targets and icp_profiles
-- -------------------------------------------------------------------------
-- Scoring pipeline reads this to pick the ICP when a contact/company target
-- is active. `is_default` flags the ICP that drives default-view scoring.
CREATE TABLE IF NOT EXISTS research_target_icps (
  target_id      UUID NOT NULL REFERENCES research_targets(id) ON DELETE CASCADE,
  icp_profile_id UUID NOT NULL REFERENCES icp_profiles(id)     ON DELETE CASCADE,
  is_default     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (target_id, icp_profile_id)
);

CREATE INDEX IF NOT EXISTS ix_research_target_icps_icp
  ON research_target_icps(icp_profile_id);

-- -------------------------------------------------------------------------
-- target_history — append-only back-stack for the breadcrumb trail
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS target_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  user_id       UUID,
  target_id     UUID NOT NULL REFERENCES research_targets(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('primary', 'secondary')),
  switched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  switched_from UUID,
  switch_source TEXT NOT NULL
    CHECK (switch_source IN ('graph_click', 'breadcrumb', 'picker', 'sidebar', 'url', 'auto_page', 'migration'))
);

CREATE INDEX IF NOT EXISTS ix_target_history_user_time
  ON target_history(tenant_id, user_id, switched_at DESC);

CREATE INDEX IF NOT EXISTS ix_target_history_target
  ON target_history(target_id, switched_at DESC);

-- -------------------------------------------------------------------------
-- research_lenses — saved (target, config) bundles
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS research_lenses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  user_id             UUID,
  name                TEXT NOT NULL,
  primary_target_id   UUID REFERENCES research_targets(id) ON DELETE SET NULL,
  secondary_target_id UUID REFERENCES research_targets(id) ON DELETE SET NULL,
  config              JSONB NOT NULL DEFAULT '{}',
  is_default          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_lenses_tenant_user
  ON research_lenses(tenant_id, user_id);

CREATE TRIGGER trg_research_lenses_updated_at
  BEFORE UPDATE ON research_lenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -------------------------------------------------------------------------
-- v_research_target — convenience view resolving target to display fields
-- -------------------------------------------------------------------------
-- Joins the three possible subject tables so callers can read `resolved_label`
-- and `avatar_url` without three-way CASE logic. Callers that do not need the
-- display columns should query research_targets directly.
CREATE OR REPLACE VIEW v_research_target AS
  SELECT rt.*,
    CASE rt.kind
      WHEN 'self'    THEN COALESCE(NULLIF(TRIM(CONCAT_WS(' ', op.first_name, op.last_name)), ''), rt.label)
      WHEN 'contact' THEN COALESCE(c.full_name, rt.label)
      WHEN 'company' THEN COALESCE(co.name, rt.label)
    END AS resolved_label,
    CASE rt.kind
      WHEN 'contact' THEN c.profile_image_url
      -- owner_profiles + companies do not have a first-class avatar column
      -- today; callers fall through to the app-side default.
      ELSE NULL
    END AS avatar_url
  FROM research_targets rt
    LEFT JOIN owner_profiles op ON op.id = rt.owner_id
    LEFT JOIN contacts       c  ON c.id  = rt.contact_id
    LEFT JOIN companies      co ON co.id = rt.company_id;

-- -------------------------------------------------------------------------
-- Seed self-targets for every existing owner_profile (Q1/A)
-- -------------------------------------------------------------------------
-- One kind='self' row per owner_profile. Tenant is the default tenant (we
-- have no multi-tenant owner_profile relationship today). On a fresh DB
-- owner_profiles is empty and the INSERT is a no-op.
DO $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants WHERE slug = 'default' LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO research_targets (tenant_id, kind, owner_id, label)
  SELECT
    v_tenant_id,
    'self',
    op.id,
    COALESCE(
      NULLIF(TRIM(CONCAT_WS(' ', op.first_name, op.last_name)), ''),
      'Self'
    )
  FROM owner_profiles op
  WHERE op.is_current = TRUE
    AND NOT EXISTS (
      SELECT 1 FROM research_targets rt
      WHERE rt.tenant_id = v_tenant_id AND rt.owner_id = op.id
    );
END $$;
