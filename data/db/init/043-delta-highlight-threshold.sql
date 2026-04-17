-- Research Tools Sprint — Phase 4 Track I: Delta highlight threshold per owner.
--
-- Adds `delta_highlight_threshold` to `owner_profiles` (default 0.20 = 20%).
-- Scoring cards and goal toasters read this value to decide whether a
-- score/metric delta is "big enough" to highlight versus dim. The threshold
-- is owner-level (not per-target, not per-lens) because it is a display
-- preference — the same contact's 15% swing should be rendered the same way
-- regardless of which target is currently focused.
--
-- Value is a relative ratio stored as REAL: `abs(new - old) / max(1, abs(old))`
-- must be >= threshold for the delta to receive highlight treatment. A
-- threshold of 0.00 highlights every change; 1.00 highlights only
-- 100%-or-greater swings. Default 0.20 = 20% per the sprint spec
-- (`.planning/research-tools-sprint/08-phased-delivery.md` §6 and §4 of
-- `.planning/research-tools-sprint/04-targets-and-graph.md`).
--
-- CHECK constraint keeps the column in [0, 1]. Values outside that range are
-- either meaningless (negative thresholds never fire) or overflow the "show
-- every big change" intent.

ALTER TABLE owner_profiles
  ADD COLUMN IF NOT EXISTS delta_highlight_threshold REAL NOT NULL DEFAULT 0.20;

ALTER TABLE owner_profiles
  DROP CONSTRAINT IF EXISTS chk_delta_highlight_threshold_range;

ALTER TABLE owner_profiles
  ADD CONSTRAINT chk_delta_highlight_threshold_range
  CHECK (delta_highlight_threshold >= 0.0 AND delta_highlight_threshold <= 1.0);
