-- Research Tools Sprint — WS-5 Phase 6 hardening (source-conflict override).
--
-- Per `05-source-expansion.md` §13.4 and ADR-032:
--   "Manual user override always wins. A user-edited field is marked
--    `user_override=true` and no source-based reconciliation touches it
--    without explicit re-override."
--
-- This table records each active override per (tenant, entity, field). The
-- disagreement detector consults it first: if an uncleared row exists the
-- override value is returned as the winner with `pinnedByUser: true`, and
-- the banner still renders when newly-ingested sources disagree with it.
-- Clearing an override sets `cleared_at` — history is retained for audit.

CREATE TABLE IF NOT EXISTS source_field_overrides (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  entity_kind     TEXT NOT NULL CHECK (entity_kind IN ('contact', 'company')),
  entity_id       UUID NOT NULL,
  field_name      TEXT NOT NULL,
  value           TEXT NOT NULL,
  set_by_user_id  UUID,
  set_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cleared_at      TIMESTAMPTZ,
  cleared_by_user_id UUID,
  note            TEXT
);

-- Only one active override per (tenant, entity, field) at a time.
-- Partial unique index over the "currently active" (cleared_at IS NULL) rows
-- lets us keep a full history of prior overrides without deleting them.
CREATE UNIQUE INDEX IF NOT EXISTS uq_source_field_overrides_active
  ON source_field_overrides (tenant_id, entity_kind, entity_id, field_name)
  WHERE cleared_at IS NULL;

-- Covering index for the "find active override for entity" lookup the
-- disagreement detector does on every field-conflicts read.
CREATE INDEX IF NOT EXISTS ix_source_field_overrides_lookup
  ON source_field_overrides (tenant_id, entity_kind, entity_id, field_name)
  WHERE cleared_at IS NULL;

-- Audit index — "show me every override this user has made".
CREATE INDEX IF NOT EXISTS ix_source_field_overrides_user
  ON source_field_overrides (set_by_user_id, set_at DESC);
