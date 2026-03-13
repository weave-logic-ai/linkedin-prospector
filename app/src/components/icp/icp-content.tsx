"use client";

import useSWR from "swr";
import { NicheCard } from "@/components/icp/niche-card";
import { NicheComparison } from "@/components/icp/niche-comparison";
import { NaturalNicheSection } from "@/components/icp/natural-niche-section";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export interface NicheData {
  id: string;
  label: string;
  contactCount: number;
  goldCount: number;
  silverCount: number;
  bronzeCount: number;
  watchCount: number;
  avgGoldScore: number;
  avgIcpFit: number;
  avgNetworkHub: number;
  goldDensity: number;
  topContacts: { name: string; goldScore: number; company: string }[];
  topCompanies: { name: string; count: number }[];
  keywords: { keyword: string; count: number }[];
}

export interface NichesResponse {
  niches: NicheData[];
  summary: {
    totalNiches: number;
    totalContacts: number;
    avgGoldDensity: number;
  };
}

export function ICPContent() {
  const { data, error, isLoading } = useSWR<NichesResponse>(
    "/api/niches",
    fetcher,
  );

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ICP & Niches</h1>
          <p className="text-muted-foreground text-sm">
            Cluster-based niche analysis
          </p>
        </div>
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
          <p className="text-destructive text-sm">
            Failed to load niche data: {error.message}
          </p>
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ICP & Niches</h1>
          <p className="text-muted-foreground text-sm">
            Cluster-based niche analysis
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ICP & Niches</h1>
          <p className="text-muted-foreground text-sm">
            Cluster-based niche analysis across your network
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <div className="text-center">
            <div className="text-lg font-semibold tabular-nums">
              {data.summary.totalNiches}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Niches
            </div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold tabular-nums">
              {data.summary.totalContacts.toLocaleString()}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Classified
            </div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold tabular-nums">
              {(data.summary.avgGoldDensity * 100).toFixed(1)}%
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Avg Gold %
            </div>
          </div>
        </div>
      </div>

      {/* Natural Niche Recommendation */}
      <NaturalNicheSection />

      {/* ICP Fit Analysis - tier legend */}
      <div className="flex items-center gap-4 text-xs">
        <span className="text-muted-foreground">Tier distribution:</span>
        <span className="flex items-center gap-1">
          <Badge variant="gold" className="h-4 px-1 text-[9px]">
            Gold
          </Badge>
          <Badge variant="silver" className="h-4 px-1 text-[9px]">
            Silver
          </Badge>
          <Badge variant="bronze" className="h-4 px-1 text-[9px]">
            Bronze
          </Badge>
          <Badge variant="watch" className="h-4 px-1 text-[9px]">
            Watch
          </Badge>
        </span>
      </div>

      {/* Niche cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {data.niches.map((niche) => (
          <NicheCard key={niche.id} niche={niche} />
        ))}
      </div>

      {/* Cross-niche comparison */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Cross-Niche Comparison</h2>
        <NicheComparison niches={data.niches} />
      </div>
    </div>
  );
}
