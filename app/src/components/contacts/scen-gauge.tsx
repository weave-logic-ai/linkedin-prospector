"use client";

interface SCENGaugeProps {
  confidence: number;
  grade: "A" | "B" | "C" | "D" | "F";
  gaps: string[];
  recommendation: string;
}

const GRADE_COLORS: Record<string, string> = {
  A: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700",
  B: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700",
  C: "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700",
  D: "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700",
  F: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700",
};

export function SCENGauge({
  confidence,
  grade,
  gaps,
  recommendation,
}: SCENGaugeProps) {
  const pct = Math.round(confidence * 100);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">Confidence</span>
        <span className="text-muted-foreground">{pct}%</span>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center justify-center w-8 h-8 rounded-md border text-sm font-bold ${GRADE_COLORS[grade]}`}
        >
          {grade}
        </span>
        <div className="text-xs text-muted-foreground space-y-0.5">
          {gaps.slice(0, 2).map((g) => (
            <span key={g} className="block truncate">
              {g}
            </span>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground italic">
        {recommendation}
      </p>
    </div>
  );
}
