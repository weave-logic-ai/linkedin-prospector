"use client";

import * as React from "react";
import useSWR from "swr";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

interface BudgetData {
  used: number;
  total: number;
  lastSync: string;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function RateBudgetMeter() {
  const { data, error } = useSWR<BudgetData>("/api/budget", fetcher, {
    refreshInterval: 60000,
    fallbackData: { used: 23, total: 80, lastSync: new Date().toISOString() },
    onError: () => {},
  });

  const budget = data ?? { used: 23, total: 80, lastSync: new Date().toISOString() };
  const percentage = Math.round((budget.used / budget.total) * 100);

  const colorClass =
    percentage > 80
      ? "bg-red-500"
      : percentage > 50
        ? "bg-amber-500"
        : "bg-emerald-500";

  const lastSyncDisplay = React.useMemo(() => {
    try {
      const date = new Date(budget.lastSync);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "--:--";
    }
  }, [budget.lastSync]);

  return (
    <div className="px-3 py-2 space-y-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground font-medium">Budget</span>
        <span
          className={cn(
            "tabular-nums font-medium",
            percentage > 80
              ? "text-red-500"
              : percentage > 50
                ? "text-amber-500"
                : "text-muted-foreground"
          )}
        >
          {budget.used}/{budget.total}
        </span>
      </div>
      <Progress value={percentage} className="h-1.5" indicatorClassName={colorClass} />
      <div className="flex items-center justify-between text-[10px] text-muted-foreground/60">
        <span>Last sync</span>
        <span className="tabular-nums">{error ? "offline" : lastSyncDisplay}</span>
      </div>
    </div>
  );
}
