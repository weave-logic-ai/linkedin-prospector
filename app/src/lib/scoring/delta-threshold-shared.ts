// Phase 4 Track I — client-safe delta-threshold helpers.
//
// This module contains the pure-function evaluator and the default
// constant. Import this from client components; the server-only reader /
// writer live in `delta-threshold.ts` and pull in `pg` which webpack
// refuses to bundle for the browser.

export const DEFAULT_DELTA_HIGHLIGHT_THRESHOLD = 0.20;

export interface DeltaEvaluation {
  /** |new - old| / base. NaN if `old` is null/undefined/non-finite. */
  relativeChange: number;
  /** True iff relativeChange >= threshold and both values are finite. */
  shouldHighlight: boolean;
  /** Sign: -1, 0, 1 — useful for styling colors independently of magnitude. */
  direction: -1 | 0 | 1;
}

export function evaluateDelta(
  currentValue: number | null | undefined,
  previousValue: number | null | undefined,
  threshold: number
): DeltaEvaluation {
  if (
    currentValue == null ||
    previousValue == null ||
    !Number.isFinite(currentValue) ||
    !Number.isFinite(previousValue)
  ) {
    return { relativeChange: Number.NaN, shouldHighlight: false, direction: 0 };
  }
  const delta = currentValue - previousValue;
  const denom = Math.max(1e-9, Math.abs(previousValue));
  // For |prev| >= 1 we use |prev| directly. For smaller values (scoring
  // space [0, 1]) we use denom (with a tiny floor) so the relative change
  // is still well-defined.
  const base = Math.abs(previousValue) >= 1 ? Math.abs(previousValue) : denom;
  const relativeChange = Math.abs(delta) / base;
  const clampedThreshold = Math.min(1, Math.max(0, threshold));
  const shouldHighlight = relativeChange >= clampedThreshold;
  const direction: -1 | 0 | 1 = delta > 0 ? 1 : delta < 0 ? -1 : 0;
  return { relativeChange, shouldHighlight, direction };
}
