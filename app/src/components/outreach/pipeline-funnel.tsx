"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface FunnelStage {
  stage: string;
  count: number;
}

interface PipelineFunnelProps {
  funnel: FunnelStage[];
}

const stageColors: Record<string, string> = {
  planned: "bg-blue-500",
  sent: "bg-cyan-500",
  responded: "bg-emerald-500",
  engaged: "bg-green-500",
  converted: "bg-violet-500",
};

const stageLabels: Record<string, string> = {
  planned: "Planned",
  sent: "Sent / Pending",
  responded: "Responded",
  engaged: "Engaged",
  converted: "Converted",
};

export function PipelineFunnel({ funnel }: PipelineFunnelProps) {
  const maxCount = Math.max(...funnel.map((s) => s.count), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Outreach Funnel</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {funnel.map((stage) => {
            const width =
              maxCount > 0
                ? Math.max((stage.count / maxCount) * 100, stage.count > 0 ? 8 : 2)
                : 2;
            const color = stageColors[stage.stage] || "bg-muted";
            const label = stageLabels[stage.stage] || stage.stage;

            return (
              <div key={stage.stage} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-24 text-right shrink-0">
                  {label}
                </span>
                <div className="flex-1 h-7 bg-muted/30 rounded overflow-hidden relative">
                  <div
                    className={`h-full ${color} rounded transition-all duration-500 ease-out flex items-center`}
                    style={{ width: `${width}%` }}
                  >
                    {stage.count > 0 && (
                      <span className="text-[10px] font-mono text-white px-2 whitespace-nowrap">
                        {stage.count}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
