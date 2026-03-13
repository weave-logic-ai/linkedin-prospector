"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import { NetworkGraph } from "@/components/network/network-graph";
import { GraphControls } from "@/components/network/graph-controls";
import { ClusterSidebar } from "@/components/network/cluster-sidebar";
import { Skeleton } from "@/components/ui/skeleton";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export type ColorByMode = "tier" | "cluster" | "persona" | "degree";
export type LayoutMode = "force" | "cluster-grouped" | "gold-centered" | "radial";
export type SizeByMode = "tier" | "goldScore" | "connections" | "uniform";
export type LabelMode = "gold" | "all" | "hover" | "none";

export interface EdgeTypeFilters {
  "same-company": boolean;
  "same-cluster": boolean;
  "mutual-proximity": boolean;
}

export interface GraphSettings {
  // Layout
  layout: LayoutMode;
  repulsion: number;
  attraction: number;
  gravity: number;
  // Appearance
  colorBy: ColorByMode;
  sizeBy: SizeByMode;
  labelMode: LabelMode;
  // Edges
  edgeTypes: EdgeTypeFilters;
  weightThreshold: number;
  edgeOpacity: number;
  // Data
  maxNodes: number;
  knn: number;
  // Overlays
  showClusterLabels: boolean;
  showClusterHulls: boolean;
}

const DEFAULT_SETTINGS: GraphSettings = {
  layout: "cluster-grouped",
  repulsion: 300,
  attraction: 0.005,
  gravity: 0.001,
  colorBy: "tier",
  sizeBy: "tier",
  labelMode: "gold",
  edgeTypes: { "same-company": true, "same-cluster": true, "mutual-proximity": true },
  weightThreshold: 0,
  edgeOpacity: 0.2,
  maxNodes: 200,
  knn: 8,
  showClusterLabels: true,
  showClusterHulls: true,
};

export function NetworkContent() {
  const [settings, setSettings] = useState<GraphSettings>(DEFAULT_SETTINGS);
  const updateSettings = useCallback((patch: Partial<GraphSettings>) => {
    setSettings(prev => ({ ...prev, ...patch }));
  }, []);

  const [selectedCluster, setSelectedCluster] = useState<number | null>(null);

  const dataUrl = `/api/graph?maxNodes=${settings.maxNodes}&k=${settings.knn}`;
  const { data, error, isLoading } = useSWR(dataUrl, fetcher);

  if (error) {
    return (
      <div className="flex h-[calc(100vh-7rem)] items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-destructive font-medium">
            Failed to load graph data
          </p>
          <p className="text-muted-foreground text-sm">{error.message}</p>
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="flex h-[calc(100vh-7rem)] gap-4">
        <div className="flex-1">
          <Skeleton className="h-full w-full rounded-lg" />
        </div>
        <div className="w-64 space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-0">
      {/* Main graph viewport */}
      <div className="relative flex-1 overflow-hidden rounded-lg border border-border bg-zinc-950">
        <NetworkGraph
          data={data}
          settings={settings}
          selectedCluster={selectedCluster}
        />

        {/* Floating controls */}
        <div className="absolute left-3 top-3 z-10">
          <GraphControls
            settings={settings}
            onSettingsChange={updateSettings}
          />
        </div>

        {/* Stats bar */}
        <div className="absolute bottom-3 left-3 z-10 flex gap-3 text-xs text-muted-foreground">
          <span>
            Showing {data.nodes.length} of {data.stats.totalNodes} nodes
          </span>
          <span className="text-border">|</span>
          <span>{data.edges.length} edges (pruned)</span>
          <span className="text-border">|</span>
          <span>Density: {data.stats.density}</span>
        </div>
      </div>

      {/* Cluster sidebar */}
      <ClusterSidebar
        clusters={data.clusters}
        selectedCluster={selectedCluster}
        onSelectCluster={setSelectedCluster}
      />
    </div>
  );
}
