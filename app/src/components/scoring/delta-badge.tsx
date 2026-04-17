"use client";

// Phase 4 Track I — reusable delta badge.
//
// Renders a compact numeric delta (e.g. "+5.4%") next to scoring values. The
// badge is dimmed when |relative change| is below the owner's
// `delta_highlight_threshold` and emphasized when it meets or exceeds it.
//
// The threshold is owner-level (not per-card), so parent components pass in
// the already-resolved threshold — avoiding one fetch per card. A shared
// `useDeltaThreshold` hook is provided below for callers that don't have it
// on hand.

import { useEffect, useState } from "react";
import {
  evaluateDelta,
  DEFAULT_DELTA_HIGHLIGHT_THRESHOLD,
} from "@/lib/scoring/delta-threshold-shared";

interface DeltaBadgeProps {
  currentValue: number | null | undefined;
  previousValue: number | null | undefined;
  threshold: number;
  /** When true, show absolute delta; default shows percentage points. */
  asAbsolute?: boolean;
  className?: string;
}

export function DeltaBadge({
  currentValue,
  previousValue,
  threshold,
  asAbsolute = false,
  className,
}: DeltaBadgeProps) {
  const delta = evaluateDelta(currentValue, previousValue, threshold);

  if (!Number.isFinite(delta.relativeChange) || delta.direction === 0) {
    return null;
  }

  const rawDelta = (currentValue ?? 0) - (previousValue ?? 0);
  const text = asAbsolute
    ? (rawDelta > 0 ? `+${rawDelta.toFixed(2)}` : rawDelta.toFixed(2))
    : `${rawDelta > 0 ? "+" : ""}${(rawDelta * 100).toFixed(1)}%`;

  const base =
    "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium transition-opacity";
  const emphasized =
    delta.direction > 0
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : "bg-red-500/15 text-red-700 dark:text-red-300";
  const dimmed = "text-muted-foreground/60 bg-transparent";

  return (
    <span
      data-testid="delta-badge"
      data-highlight={delta.shouldHighlight ? "true" : "false"}
      data-direction={delta.direction > 0 ? "up" : "down"}
      className={`${base} ${delta.shouldHighlight ? emphasized : dimmed} ${className ?? ""}`}
      title={`Relative change ${(delta.relativeChange * 100).toFixed(1)}% — threshold ${(threshold * 100).toFixed(0)}%`}
    >
      {text}
    </span>
  );
}

/** Client-side hook to load the owner threshold once. */
export function useDeltaThreshold(): number {
  const [threshold, setThreshold] = useState<number>(
    DEFAULT_DELTA_HIGHLIGHT_THRESHOLD
  );
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/profile/delta-threshold");
        if (!res.ok) return;
        const json = (await res.json()) as { data?: { threshold?: number } };
        const next = json.data?.threshold;
        if (
          !cancelled &&
          typeof next === "number" &&
          Number.isFinite(next) &&
          next >= 0 &&
          next <= 1
        ) {
          setThreshold(next);
        }
      } catch {
        // Silent — the component falls back to the default threshold, which
        // is the same behavior as a fresh install without the migration.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return threshold;
}
