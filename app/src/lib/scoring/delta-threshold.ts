// Phase 4 Track I — owner-level delta-highlight threshold.
//
// Scoring cards and goal toasters compute deltas between the current value
// and the previous value; the owner profile stores a relative threshold (as
// a ratio in [0, 1], default 0.20 = 20%) used to decide whether the delta
// deserves "highlight" treatment or should be dimmed.
//
// This module pulls in the pg client. Client components MUST import from
// `./delta-threshold-shared` — webpack refuses to bundle `pg` for the
// browser. Server-side consumers (route handlers, RSC) can use either.

import { query } from '../db/client';

export {
  DEFAULT_DELTA_HIGHLIGHT_THRESHOLD,
  evaluateDelta,
  type DeltaEvaluation,
} from './delta-threshold-shared';
import { DEFAULT_DELTA_HIGHLIGHT_THRESHOLD } from './delta-threshold-shared';

/**
 * Reads the current owner's threshold. Falls back to the default on any
 * error (missing column, missing row, pool disconnected) so the delta UI
 * never blocks on configuration.
 */
export async function getOwnerDeltaThreshold(): Promise<number> {
  try {
    const res = await query<{ delta_highlight_threshold: number | null }>(
      `SELECT delta_highlight_threshold FROM owner_profiles
       WHERE is_current = TRUE LIMIT 1`
    );
    const raw = res.rows[0]?.delta_highlight_threshold;
    if (raw == null || !Number.isFinite(raw)) {
      return DEFAULT_DELTA_HIGHLIGHT_THRESHOLD;
    }
    return Math.min(1, Math.max(0, Number(raw)));
  } catch {
    return DEFAULT_DELTA_HIGHLIGHT_THRESHOLD;
  }
}

/**
 * Writes a new threshold for the current owner. Clamped to [0, 1]. Returns
 * the persisted value.
 */
export async function setOwnerDeltaThreshold(value: number): Promise<number> {
  const clamped = Math.min(
    1,
    Math.max(0, Number.isFinite(value) ? value : DEFAULT_DELTA_HIGHLIGHT_THRESHOLD)
  );
  await query(
    `UPDATE owner_profiles SET delta_highlight_threshold = $1
     WHERE is_current = TRUE`,
    [clamped]
  );
  return clamped;
}
