"use client";

interface EMOTGaugeProps {
  temperature: number;
  label: "hot" | "warm" | "lukewarm" | "cold" | "unknown";
}

const LABEL_COLORS: Record<string, string> = {
  hot: "text-red-500",
  warm: "text-orange-500",
  lukewarm: "text-yellow-600",
  cold: "text-blue-500",
  unknown: "text-muted-foreground",
};

export function EMOTGauge({ temperature, label }: EMOTGaugeProps) {
  const pct = Math.round(temperature);
  const fillColor =
    label === "hot"
      ? "bg-red-500"
      : label === "warm"
      ? "bg-orange-500"
      : label === "lukewarm"
      ? "bg-yellow-500"
      : label === "cold"
      ? "bg-blue-400"
      : "bg-gray-300";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">Interest</span>
        <span className={LABEL_COLORS[label]}>{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-4 h-12 rounded-full border border-border bg-muted/30 relative overflow-hidden">
          <div
            className={`absolute bottom-0 left-0 right-0 rounded-full ${fillColor}`}
            style={{ height: `${pct}%` }}
          />
        </div>
        <span className="text-sm font-medium">{pct}%</span>
      </div>
    </div>
  );
}
