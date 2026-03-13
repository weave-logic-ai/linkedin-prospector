"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StateCardsProps {
  states: Record<string, number>;
}

const stateConfig: Array<{
  key: string;
  label: string;
  color: string;
  bgColor: string;
}> = [
  {
    key: "planned",
    label: "Planned",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10 border-blue-500/20",
  },
  {
    key: "sent",
    label: "Sent",
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10 border-cyan-500/20",
  },
  {
    key: "pending_response",
    label: "Pending",
    color: "text-amber-500",
    bgColor: "bg-amber-500/10 border-amber-500/20",
  },
  {
    key: "responded",
    label: "Responded",
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10 border-emerald-500/20",
  },
  {
    key: "engaged",
    label: "Engaged",
    color: "text-green-500",
    bgColor: "bg-green-500/10 border-green-500/20",
  },
  {
    key: "converted",
    label: "Converted",
    color: "text-violet-500",
    bgColor: "bg-violet-500/10 border-violet-500/20",
  },
  {
    key: "declined",
    label: "Declined",
    color: "text-red-500",
    bgColor: "bg-red-500/10 border-red-500/20",
  },
  {
    key: "deferred",
    label: "Deferred",
    color: "text-gray-400",
    bgColor: "bg-gray-500/10 border-gray-500/20",
  },
  {
    key: "closed_lost",
    label: "Closed Lost",
    color: "text-rose-500",
    bgColor: "bg-rose-500/10 border-rose-500/20",
  },
];

export function StateCards({ states }: StateCardsProps) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
      {stateConfig.map((cfg) => {
        const count = states[cfg.key] || 0;

        return (
          <Card
            key={cfg.key}
            className={cn("border", cfg.bgColor)}
          >
            <CardContent className="p-3 text-center">
              <div
                className={cn(
                  "text-xl font-bold font-mono tabular-nums",
                  cfg.color
                )}
              >
                {count}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1 truncate">
                {cfg.label}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
