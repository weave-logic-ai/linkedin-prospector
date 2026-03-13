"use client";

import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

const CLUSTER_COLORS = [
  "#6366f1", "#ec4899", "#14b8a6", "#f97316", "#8b5cf6",
  "#06b6d4", "#ef4444", "#22c55e", "#eab308", "#a855f7",
];

interface Cluster {
  id: number;
  label: string;
  count: number;
  goldCount: number;
  keywords: string[];
  hubNames: string[];
}

interface ClusterSidebarProps {
  clusters: Cluster[];
  selectedCluster: number | null;
  onSelectCluster: (id: number | null) => void;
}

export function ClusterSidebar({
  clusters,
  selectedCluster,
  onSelectCluster,
}: ClusterSidebarProps) {
  const sorted = [...clusters].sort((a, b) => b.goldCount - a.goldCount);

  return (
    <div className="w-56 border-l border-border bg-card flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Clusters
        </span>
        {selectedCluster !== null && (
          <button
            onClick={() => onSelectCluster(null)}
            className="text-[10px] text-primary hover:underline"
          >
            Show all
          </button>
        )}
      </div>

      {/* Cluster list */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {sorted.map((cluster) => {
            const isSelected = selectedCluster === cluster.id;
            return (
              <button
                key={cluster.id}
                onClick={() =>
                  onSelectCluster(isSelected ? null : cluster.id)
                }
                className={cn(
                  "w-full flex flex-col rounded-md px-2.5 py-2 text-left transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  isSelected
                    ? "bg-accent text-accent-foreground border border-border"
                    : "text-foreground",
                )}
              >
                <div className="flex items-center gap-2 w-full">
                  <span
                    className="shrink-0 h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: CLUSTER_COLORS[cluster.id % CLUSTER_COLORS.length] }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate capitalize">
                      {cluster.label}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {cluster.count} contacts
                    </div>
                  </div>
                  {cluster.goldCount > 0 && (
                    <Badge
                      variant="gold"
                      className="h-4 px-1 text-[9px] font-normal shrink-0"
                    >
                      {cluster.goldCount}
                    </Badge>
                  )}
                </div>
                {cluster.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-0.5 mt-0.5">
                    {cluster.keywords.slice(0, 3).map((kw) => (
                      <span
                        key={kw}
                        className="text-[8px] rounded px-1"
                        style={{
                          backgroundColor: `${CLUSTER_COLORS[cluster.id % CLUSTER_COLORS.length]}15`,
                          color: CLUSTER_COLORS[cluster.id % CLUSTER_COLORS.length],
                        }}
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
                {cluster.hubNames.length > 0 && (
                  <div className="text-[9px] text-muted-foreground/60 mt-0.5 truncate">
                    Hubs: {cluster.hubNames.slice(0, 2).join(", ")}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
