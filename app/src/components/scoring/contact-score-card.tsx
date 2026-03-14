"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TierBadge } from "@/components/scoring/tier-badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DimensionBreakdown {
  dimension: string;
  rawValue: number;
  weightedValue: number;
  weight: number;
}

interface ScoreData {
  compositeScore: number;
  tier: string;
  persona: string | null;
  behavioralPersona: string | null;
  dimensions: DimensionBreakdown[];
}

const DIMENSION_LABELS: Record<string, string> = {
  icp_fit: "ICP Fit",
  network_hub: "Network Hub",
  relationship_strength: "Relationship",
  signal_boost: "Signal Boost",
  skills_relevance: "Skills",
  network_proximity: "Proximity",
  behavioral: "Behavioral",
  content_relevance: "Content",
  graph_centrality: "Centrality",
};

interface ContactScoreCardProps {
  contactId: string;
}

export function ContactScoreCard({ contactId }: ContactScoreCardProps) {
  const [data, setData] = useState<ScoreData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/contacts/${contactId}/scores`);
        if (res.ok) {
          const json = await res.json();
          if (!cancelled) setData(json.data);
        }
      } catch {
        // Silently fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-4">
          <div className="h-16 flex items-center justify-center text-sm text-muted-foreground">
            Loading...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-4">
          <div className="h-16 flex items-center justify-center text-sm text-muted-foreground">
            No score data available
          </div>
        </CardContent>
      </Card>
    );
  }

  const scorePercent = Math.round(data.compositeScore * 100);

  return (
    <Card className="overflow-hidden">
      <CardContent className="py-4">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-4 cursor-default">
                <div className="flex flex-col items-center justify-center flex-shrink-0">
                  <span className="text-3xl font-bold tracking-tight">
                    {scorePercent}
                  </span>
                  <span className="text-xs text-muted-foreground">Score</span>
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <TierBadge tier={data.tier} />
                    {data.persona && (
                      <span className="text-xs text-muted-foreground capitalize truncate">
                        {data.persona}
                      </span>
                    )}
                  </div>
                  <Progress value={scorePercent} className="h-1.5" />
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent className="w-64 p-3" side="bottom">
              <p className="text-xs font-medium mb-2">Dimension Breakdown</p>
              <div className="space-y-1.5">
                {data.dimensions.map((dim) => (
                  <div key={dim.dimension} className="space-y-0.5">
                    <div className="flex items-center justify-between text-xs">
                      <span>
                        {DIMENSION_LABELS[dim.dimension] || dim.dimension}
                      </span>
                      <span className="text-muted-foreground">
                        {(dim.rawValue * 100).toFixed(0)}%
                      </span>
                    </div>
                    <Progress value={dim.rawValue * 100} className="h-1" />
                  </div>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
