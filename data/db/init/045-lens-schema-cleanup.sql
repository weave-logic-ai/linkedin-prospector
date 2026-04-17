-- Research Tools Sprint — WS-4 polish: lens schema cleanup.
--
-- Migration 035 landed without the `lens_id` column on `research_target_icps`
-- and without `last_used_lens_id` on `research_target_state`. The Phase 1.5
-- lens-service (see `app/src/lib/targets/lens-service.ts`) worked around this
-- by storing the ICP ids inside `research_lenses.config.icpProfileIds` and
-- toggling `is_default` per-row to simulate activation.
--
-- This migration introduces the real columns and back-fills them from the
-- existing workaround state so downstream reads can use proper foreign-key
-- relationships.
--
-- Behavior after this migration:
--
--   1. `research_target_icps.lens_id` — a nullable FK to `research_lenses`.
--      Back-filled to each target's `is_default=TRUE` lens so existing
--      seed-lenses continue to resolve. Rows with no matching lens keep
--      `lens_id = NULL` and are treated as "legacy unscoped" by readers.
--
--   2. `research_target_state.last_used_lens_id` — a nullable FK to
--      `research_lenses`. Back-filled to the target's current default lens
--      so the active-lens read path switches from "find the is_default row"
--      to "follow the explicit FK".
--
--   3. `research_lenses.is_default` is retained as a hint ("primary lens")
--      but no longer drives the read path. activateLensForTarget() now
--      updates `research_target_state.last_used_lens_id` instead of
--      flipping the is_default bit on every sibling row.
--
-- All statements are idempotent (IF NOT EXISTS / ON CONFLICT / existence
-- checks). Safe to re-run.

-- -------------------------------------------------------------------------
-- research_target_icps.lens_id — nullable FK to research_lenses
-- -------------------------------------------------------------------------
ALTER TABLE research_target_icps
  ADD COLUMN IF NOT EXISTS lens_id UUID
    REFERENCES research_lenses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_research_target_icps_lens
  ON research_target_icps(lens_id);

-- Back-fill: for each (target, icp) row with a NULL lens_id, set it to the
-- target's `is_default = TRUE` lens if one exists. Rows with no default lens
-- are left NULL — the lens-service fallback ("active lens = default lens")
-- handles those cases.
UPDATE research_target_icps rti
SET lens_id = (
  SELECT rl.id
  FROM research_lenses rl
  WHERE rl.primary_target_id = rti.target_id
    AND rl.is_default = TRUE
    AND rl.deleted_at IS NULL
  ORDER BY rl.created_at ASC
  LIMIT 1
)
WHERE rti.lens_id IS NULL;

-- -------------------------------------------------------------------------
-- research_target_state.last_used_lens_id — nullable FK to research_lenses
-- -------------------------------------------------------------------------
ALTER TABLE research_target_state
  ADD COLUMN IF NOT EXISTS last_used_lens_id UUID
    REFERENCES research_lenses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_research_target_state_last_used_lens
  ON research_target_state(last_used_lens_id);

-- Back-fill: for each state row, set last_used_lens_id to the primary
-- target's current default lens (or NULL if none exists). Using the
-- `primary_target_id` path because that is the target the UI is actively
-- focused on when the state row was last written.
UPDATE research_target_state rts
SET last_used_lens_id = (
  SELECT rl.id
  FROM research_lenses rl
  WHERE rl.primary_target_id = rts.primary_target_id
    AND rl.is_default = TRUE
    AND rl.deleted_at IS NULL
  ORDER BY rl.created_at ASC
  LIMIT 1
)
WHERE rts.primary_target_id IS NOT NULL
  AND rts.last_used_lens_id IS NULL;
