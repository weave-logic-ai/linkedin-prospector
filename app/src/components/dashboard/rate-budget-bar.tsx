import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface RateBudgetBarProps {
  budget: {
    operations: Record<string, { used: number; limit: number }>;
    overallPercent: number;
  };
}

export function RateBudgetBar({ budget }: RateBudgetBarProps) {
  const percent = budget.overallPercent;

  const colorClass =
    percent > 80
      ? "bg-red-500"
      : percent > 50
        ? "bg-amber-500"
        : "bg-emerald-500";

  const textColor =
    percent > 80
      ? "text-red-500"
      : percent > 50
        ? "text-amber-500"
        : "text-muted-foreground";

  return (
    <Card className="col-span-4">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">
            API Rate Budget
          </CardTitle>
          <span className={cn("text-sm font-bold tabular-nums", textColor)}>
            {percent}% used
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <Progress
          value={percent}
          className="h-2"
          indicatorClassName={colorClass}
        />
        {Object.keys(budget.operations).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
            {Object.entries(budget.operations).map(([name, op]) => (
              <div key={name} className="flex items-center gap-1.5 text-[11px]">
                <span className="text-muted-foreground">{name}:</span>
                <span className="tabular-nums font-medium">
                  {op.used}/{op.limit}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
