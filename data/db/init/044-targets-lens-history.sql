-- Research Tools Sprint — WS-4 Phase 4 Track H
-- Adds:
--   1. `research_lenses.deleted_at` for soft-delete so shared deep-link URLs
--      that reference a deleted lens can render a "deleted" banner instead of
--      a 404.
--   2. `research_target_state.history` JSONB column — a bounded ring-buffer
--      of the last N (target_id, lens_id, opened_at) entries, used to render
--      the breadcrumb hover card + swap-back button.
--
-- Both additions are `ADD COLUMN IF NOT EXISTS`: idempotent, no data loss,
-- zero-impact when the Phase 4 flag is off.

-- -------------------------------------------------------------------------
-- research_lenses.deleted_at — soft delete
-- -------------------------------------------------------------------------
ALTER TABLE research_lenses
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ix_research_lenses_not_deleted
  ON research_lenses(primary_target_id)
  WHERE deleted_at IS NULL;

-- -------------------------------------------------------------------------
-- research_target_state.history — bounded secondary-switch ring buffer
-- -------------------------------------------------------------------------
-- Shape: jsonb array of
--   { "targetId": uuid, "lensId": uuid|null, "openedAt": ISO-8601 }
-- Capped at 20 entries by application code (the POST history endpoint trims
-- on write). New entries are prepended so index 0 is the most recent.
ALTER TABLE research_target_state
  ADD COLUMN IF NOT EXISTS history JSONB NOT NULL DEFAULT '[]'::jsonb;
