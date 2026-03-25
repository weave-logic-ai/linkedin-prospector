"use client";

import { Badge } from "@/components/ui/badge";

interface DTSEPanelProps {
  activeGoals: Array<{ id: string; title: string; progress: number }>;
  pendingTasks: Array<{
    id: string;
    title: string;
    taskType: string;
    priority: number;
  }>;
  completedTasks: number;
  beliefs: {
    likelyBuyer: boolean;
    warmLead: boolean;
    hubConnector: boolean;
    referralSource: boolean;
  };
  nextBestAction: string;
}

export function DTSEPanel({
  activeGoals,
  pendingTasks,
  completedTasks,
  beliefs,
  nextBestAction,
}: DTSEPanelProps) {
  const beliefLabels: Array<{ key: keyof typeof beliefs; label: string }> = [
    { key: "likelyBuyer", label: "Buyer" },
    { key: "warmLead", label: "Warm Lead" },
    { key: "hubConnector", label: "Hub" },
    { key: "referralSource", label: "Referral" },
  ];

  const activeBeliefs = beliefLabels.filter((b) => beliefs[b.key]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">Strategy & Tasks</span>
        <span className="text-muted-foreground">
          {completedTasks} done
        </span>
      </div>

      {activeBeliefs.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {activeBeliefs.map((b) => (
            <Badge key={b.key} variant="secondary" className="text-[10px] px-1.5 py-0">
              {b.label}
            </Badge>
          ))}
        </div>
      )}

      {activeGoals.length > 0 && (
        <div className="space-y-1.5">
          {activeGoals.slice(0, 3).map((g) => (
            <div key={g.id} className="text-xs">
              <div className="flex items-center justify-between">
                <span className="truncate">{g.title}</span>
                <span className="text-muted-foreground ml-1">
                  {Math.round(g.progress * 100)}%
                </span>
              </div>
              <div className="h-1 bg-muted rounded-full mt-0.5">
                <div
                  className="h-1 bg-primary rounded-full"
                  style={{ width: `${Math.round(g.progress * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {pendingTasks.length > 0 && (
        <div className="space-y-1">
          {pendingTasks.slice(0, 3).map((t) => (
            <div key={t.id} className="text-xs flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-yellow-500 flex-shrink-0" />
              <span className="truncate text-muted-foreground">{t.title}</span>
            </div>
          ))}
        </div>
      )}

      {nextBestAction && nextBestAction !== "No pending actions" && (
        <div className="text-xs rounded-md bg-primary/5 border border-primary/20 px-2 py-1.5">
          <span className="text-muted-foreground">Next: </span>
          <span className="font-medium">{nextBestAction}</span>
        </div>
      )}

      {activeGoals.length === 0 && pendingTasks.length === 0 && (
        <p className="text-xs text-muted-foreground">No active goals or tasks</p>
      )}
    </div>
  );
}
