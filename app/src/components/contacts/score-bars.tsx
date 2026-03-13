"use client";

import { cn } from "@/lib/utils";

interface ScoreItem {
  label: string;
  value: number | null;
}

interface ScoreBarsProps {
  scores: ScoreItem[];
}

function barColor(value: number): string {
  if (value >= 0.6) return "bg-emerald-500";
  if (value >= 0.3) return "bg-amber-400";
  return "bg-red-400";
}

function textColor(value: number): string {
  if (value >= 0.6) return "text-emerald-500";
  if (value >= 0.3) return "text-amber-400";
  return "text-red-400";
}

export function ScoreBars({ scores }: ScoreBarsProps) {
  return (
    <div className="space-y-3">
      {scores.map((score) => {
        const val = score.value ?? 0;
        const pct = Math.round(val * 100);

        return (
          <div key={score.label} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{score.label}</span>
              {score.value !== null ? (
                <span className={cn("font-mono font-semibold text-xs", textColor(val))}>
                  {pct}
                </span>
              ) : (
                <span className="font-mono text-xs text-muted-foreground/50">N/A</span>
              )}
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              {score.value !== null && (
                <div
                  className={cn("h-full rounded-full transition-all duration-500", barColor(val))}
                  style={{ width: `${pct}%` }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
