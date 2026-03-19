"use client";

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ClusterData {
  id: string;
  label: string;
  description: string | null;
  memberCount: number;
  algorithm: string;
  metadata: Record<string, unknown>;
}

interface ClusterSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  highlightedCluster: string | null;
  onHighlightCluster: (clusterId: string | null) => void;
}

export function ClusterSidebar({
  open,
  onOpenChange,
  highlightedCluster,
  onHighlightCluster,
}: ClusterSidebarProps) {
  const [clusters, setClusters] = useState<ClusterData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function fetchClusters() {
      setLoading(true);
      try {
        const res = await fetch("/api/graph/communities");
        if (res.ok) {
          const json = await res.json();
          if (!cancelled) setClusters(json.data || []);
        }
      } catch {
        // Silently handle fetch errors
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchClusters();
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-72 p-0">
        <SheetHeader className="p-4 pb-2">
          <SheetTitle className="text-sm">Communities</SheetTitle>
          <SheetDescription className="text-xs">
            Click a cluster to highlight its nodes
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-8rem)] px-4">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              Loading clusters...
            </div>
          ) : clusters.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No communities detected yet.
            </div>
          ) : (
            <div className="space-y-2 pb-4">
              {highlightedCluster && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => onHighlightCluster(null)}
                >
                  Clear highlight
                </Button>
              )}
              {clusters.map((cluster) => (
                <button
                  key={cluster.id}
                  type="button"
                  onClick={() =>
                    onHighlightCluster(
                      highlightedCluster === cluster.id ? null : cluster.id
                    )
                  }
                  className={`
                    w-full rounded-lg border p-3 text-left transition-colors
                    hover:bg-accent/50
                    ${highlightedCluster === cluster.id ? "border-primary bg-accent" : "border-border"}
                  `}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate max-w-[140px]">
                      {cluster.label}
                    </span>
                    <Badge variant="secondary" className="text-[10px] ml-2 shrink-0">
                      {cluster.memberCount}
                    </Badge>
                  </div>
                  {cluster.description && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {cluster.description}
                    </p>
                  )}
                  <div className="mt-1.5">
                    <Badge variant="outline" className="text-[10px]">
                      {cluster.algorithm}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
