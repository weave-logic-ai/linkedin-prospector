"use client";

interface RSTEGaugeProps {
  overall: number;
  status: "strong" | "warm" | "cooling" | "dormant" | "new" | "unknown";
  trend: "improving" | "stable" | "declining";
}

const STATUS_COLORS: Record<string, string> = {
  strong: "text-green-600",
  warm: "text-yellow-600",
  cooling: "text-orange-500",
  dormant: "text-red-500",
  new: "text-blue-500",
  unknown: "text-muted-foreground",
};

const TREND_ARROWS: Record<string, string> = {
  improving: "^",
  stable: "=",
  declining: "v",
};

export function RSTEGauge({ overall, status, trend }: RSTEGaugeProps) {
  const pct = Math.round(overall);
  const circumference = 2 * Math.PI * 36;
  const dashOffset = circumference - (pct / 100) * circumference;

  const strokeColor =
    status === "strong"
      ? "#22c55e"
      : status === "warm"
      ? "#eab308"
      : status === "cooling"
      ? "#f97316"
      : status === "dormant"
      ? "#ef4444"
      : status === "new"
      ? "#3b82f6"
      : "#94a3b8";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">Relationship</span>
        <span className={STATUS_COLORS[status]}>{status}</span>
      </div>
      <div className="flex items-center gap-2">
        <svg width="56" height="56" viewBox="0 0 80 80" className="flex-shrink-0">
          <circle
            cx="40"
            cy="40"
            r="36"
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth="6"
          />
          <circle
            cx="40"
            cy="40"
            r="36"
            fill="none"
            stroke={strokeColor}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 40 40)"
          />
          <text
            x="40"
            y="40"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="14"
            fontWeight="600"
            fill="currentColor"
          >
            {pct}
          </text>
        </svg>
        <div className="text-xs text-muted-foreground">
          <span className="block capitalize">{status}</span>
          <span className="block">
            {TREND_ARROWS[trend]} {trend}
          </span>
        </div>
      </div>
    </div>
  );
}
