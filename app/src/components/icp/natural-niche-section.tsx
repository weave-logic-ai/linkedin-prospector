"use client";

import useSWR from "swr";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Target, TrendingUp, Users, Building2, Briefcase } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ClusterRanking {
  id: string;
  label: string;
  goldDensity: number;
  goldCount: number;
  total: number;
  avgGoldScore: number;
  buyerCount: number;
  warmLeadCount: number;
  compositeScore: number;
}

interface NaturalNicheResponse {
  naturalNiche: {
    primaryCluster: { id: string; label: string; goldDensity: number; goldCount: number; compositeScore: number } | null;
    secondaryCluster: { id: string; label: string; goldDensity: number; goldCount: number; compositeScore: number } | null;
    allClusters: ClusterRanking[];
    nicheLabel: string;
  } | null;
  derivedICP: {
    goldContactCount: number;
    totalContacts: number;
    goldPercentage: number;
    avgScores: { goldScore: number; icpFit: number; networkHub: number };
    topTags: { tag: string; count: number }[];
    topPersonas: { persona: string; count: number }[];
    topRoles: { role: string; count: number }[];
    topCompanies: { company: string; count: number }[];
    topIndustries: { industry: string; count: number }[];
  };
  message?: string;
}

export function NaturalNicheSection() {
  const { data, error, isLoading } = useSWR<NaturalNicheResponse>(
    "/api/niches/natural",
    fetcher,
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-72 rounded-lg" />
          <Skeleton className="h-72 rounded-lg" />
        </div>
      </div>
    );
  }

  if (error || !data || !data.naturalNiche) {
    return null;
  }

  const { naturalNiche, derivedICP } = data;
  const primary = naturalNiche.primaryCluster;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Target className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Your Natural Niche</h2>
        <Badge variant="outline" className="text-[10px]">
          Derived from network
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Niche Recommendation */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="space-y-1">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Strongest niche
            </div>
            <div className="text-xl font-bold capitalize">
              {primary?.label || "—"}
            </div>
            <p className="text-xs text-muted-foreground">
              {naturalNiche.nicheLabel}
            </p>
          </div>

          {/* Cluster ranking bars */}
          <div className="space-y-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Cluster ranking by gold concentration
            </div>
            {naturalNiche.allClusters.slice(0, 6).map((cluster, i) => {
              const maxDensity = naturalNiche.allClusters[0]?.goldDensity || 1;
              const barWidth = maxDensity > 0 ? (cluster.goldDensity / maxDensity) * 100 : 0;
              return (
                <div key={cluster.id} className="space-y-0.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className={cn("capitalize", i === 0 && "font-semibold text-primary")}>
                      {cluster.label}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {(cluster.goldDensity * 100).toFixed(1)}% ({cluster.goldCount}/{cluster.total})
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        i === 0 ? "bg-primary" : "bg-primary/40",
                      )}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border text-center">
            <div>
              <div className="text-sm font-semibold tabular-nums">
                {derivedICP.goldContactCount}
              </div>
              <div className="text-[9px] text-muted-foreground">Gold Contacts</div>
            </div>
            <div>
              <div className="text-sm font-semibold tabular-nums">
                {derivedICP.goldPercentage}%
              </div>
              <div className="text-[9px] text-muted-foreground">of Network</div>
            </div>
            <div>
              <div className="text-sm font-semibold tabular-nums">
                {(derivedICP.avgScores.goldScore * 100).toFixed(0)}
              </div>
              <div className="text-[9px] text-muted-foreground">Avg Score</div>
            </div>
          </div>
        </div>

        {/* Right: Derived ICP Profile */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="space-y-1">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Derived ICP Profile
            </div>
            <p className="text-xs text-muted-foreground">
              Built from traits of your {derivedICP.goldContactCount} gold-tier contacts
            </p>
          </div>

          {/* Industries */}
          {derivedICP.topIndustries.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">
                <TrendingUp className="h-3 w-3" />
                Industries
              </div>
              <div className="flex flex-wrap gap-1.5">
                {derivedICP.topIndustries.map((ind) => (
                  <Badge key={ind.industry} variant="secondary" className="text-[10px] px-2 py-0.5">
                    {ind.industry} ({ind.count})
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Roles */}
          {derivedICP.topRoles.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">
                <Briefcase className="h-3 w-3" />
                Decision-Maker Roles
              </div>
              <div className="flex flex-wrap gap-1.5">
                {derivedICP.topRoles.map((r) => (
                  <Badge key={r.role} variant="outline" className="text-[10px] px-2 py-0.5">
                    {r.role} ({r.count})
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Top Companies */}
          {derivedICP.topCompanies.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">
                <Building2 className="h-3 w-3" />
                Top Companies
              </div>
              <div className="flex flex-wrap gap-1.5">
                {derivedICP.topCompanies.slice(0, 6).map((co) => (
                  <Badge key={co.company} variant="outline" className="text-[10px] px-2 py-0.5">
                    {co.company} ({co.count})
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Personas */}
          {derivedICP.topPersonas.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">
                <Users className="h-3 w-3" />
                Persona Types
              </div>
              <div className="flex flex-wrap gap-1.5">
                {derivedICP.topPersonas.map((p) => (
                  <Badge
                    key={p.persona}
                    variant={p.persona === "buyer" ? "gold" : p.persona === "warm-lead" ? "silver" : "outline"}
                    className="text-[10px] px-2 py-0.5"
                  >
                    {p.persona} ({p.count})
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Key Traits */}
          {derivedICP.topTags.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-border">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Key traits
              </div>
              <div className="flex flex-wrap gap-1">
                {derivedICP.topTags.map((t) => (
                  <span
                    key={t.tag}
                    className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {t.tag} ({t.count})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
