import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

interface KpiCardProps {
  label: string;
  value: number | string;
  secondary?: string;
  accent?: "gold" | "silver" | "bronze" | "default";
}

const accentColors: Record<string, string> = {
  gold: "border-l-[hsl(var(--tier-gold))] border-l-2",
  silver: "border-l-[hsl(var(--tier-silver))] border-l-2",
  bronze: "border-l-[hsl(var(--tier-bronze))] border-l-2",
  default: "",
};

const accentTextColors: Record<string, string> = {
  gold: "text-[hsl(var(--tier-gold))]",
  silver: "text-[hsl(var(--tier-silver))]",
  bronze: "text-[hsl(var(--tier-bronze))]",
  default: "text-foreground",
};

export function KpiCard({
  label,
  value,
  secondary,
  accent = "default",
}: KpiCardProps) {
  return (
    <Card className={cn("h-[120px]", accentColors[accent])}>
      <CardContent className="flex h-full flex-col justify-center p-4">
        <p
          className={cn(
            "text-3xl font-bold tabular-nums leading-none",
            accentTextColors[accent]
          )}
        >
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
        <p className="mt-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </p>
        {secondary && (
          <p className="mt-0.5 text-[11px] text-muted-foreground/70 tabular-nums">
            {secondary}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
