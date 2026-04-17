"use client";

// Phase 4 Track I — user-facing setting for the owner-level delta-highlight
// threshold. Renders a slider + numeric readout; the threshold is always
// active (not gated on RESEARCH_FLAGS.targets) because scoring deltas are
// an owner-scoped preference.

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { DEFAULT_DELTA_HIGHLIGHT_THRESHOLD } from "@/lib/scoring/delta-threshold-shared";

export function DeltaThresholdSetting() {
  const [value, setValue] = useState<number>(DEFAULT_DELTA_HIGHLIGHT_THRESHOLD);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/profile/delta-threshold");
        if (!res.ok) return;
        const json = (await res.json()) as { data?: { threshold?: number } };
        if (
          !cancelled &&
          typeof json.data?.threshold === "number" &&
          Number.isFinite(json.data.threshold)
        ) {
          setValue(json.data.threshold);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async (next: number) => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/profile/delta-threshold", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threshold: next }),
      });
      if (res.ok) {
        setSaved(true);
        // Clear the "saved" chip after a short delay. Lint-free timer: we
        // don't clear on unmount because the state update is harmless.
        setTimeout(() => setSaved(false), 1500);
      }
    } catch {
      // Silent — the slider still reflects the local optimistic value.
    } finally {
      setSaving(false);
    }
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = Number(e.target.value) / 100; // slider is in percent
      setValue(next);
    },
    []
  );

  const handleCommit = useCallback(() => {
    void save(value);
  }, [save, value]);

  const percentLabel = `${Math.round(value * 100)}%`;

  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">Delta highlight threshold</h3>
            <p className="text-xs text-muted-foreground">
              Score changes at or above this amount are highlighted in cards
              and toasts. Smaller changes are dimmed. Default 20%.
            </p>
          </div>
          <span
            className="text-sm font-mono tabular-nums"
            data-testid="delta-threshold-value"
          >
            {loading ? "…" : percentLabel}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(value * 100)}
            onChange={handleChange}
            onMouseUp={handleCommit}
            onTouchEnd={handleCommit}
            onKeyUp={handleCommit}
            disabled={loading || saving}
            aria-label="Delta highlight threshold percentage"
            className="flex-1"
          />
          {saved && (
            <span className="text-xs text-emerald-600" aria-live="polite">
              Saved
            </span>
          )}
          {saving && (
            <span className="text-xs text-muted-foreground" aria-live="polite">
              Saving…
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
