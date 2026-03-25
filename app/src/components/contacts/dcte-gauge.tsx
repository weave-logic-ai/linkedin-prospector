"use client";

import { Progress } from "@/components/ui/progress";

interface DCTEGaugeProps {
  overall: number;
  segments: {
    identity: number;
    contact: number;
    context: number;
    enrichment: number;
    scoring: number;
    network: number;
  };
  missingFields: string[];
  suggestion: string;
}

const SEGMENT_LABELS: Record<string, string> = {
  identity: "Identity",
  contact: "Contact",
  context: "Context",
  enrichment: "Enrichment",
  scoring: "Scoring",
  network: "Network",
};

export function DCTEGauge({
  overall,
  segments,
  missingFields,
  suggestion,
}: DCTEGaugeProps) {
  const pct = Math.round(overall * 100);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">Data Completeness</span>
        <span className="text-muted-foreground">{pct}%</span>
      </div>
      <Progress value={pct} className="h-2" />
      <div className="grid grid-cols-3 gap-1">
        {Object.entries(segments).map(([key, val]) => (
          <div key={key} className="text-center">
            <div
              className={`h-1.5 rounded-full ${
                val >= 0.8
                  ? "bg-green-500"
                  : val >= 0.4
                  ? "bg-yellow-500"
                  : "bg-red-400"
              }`}
              style={{ width: `${Math.round(val * 100)}%`, minWidth: "4px" }}
            />
            <span className="text-[10px] text-muted-foreground">
              {SEGMENT_LABELS[key] || key}
            </span>
          </div>
        ))}
      </div>
      {missingFields.length > 0 && (
        <p className="text-[10px] text-muted-foreground truncate">
          Missing: {missingFields.slice(0, 3).join(", ")}
        </p>
      )}
      <p className="text-[10px] text-muted-foreground italic">{suggestion}</p>
    </div>
  );
}
