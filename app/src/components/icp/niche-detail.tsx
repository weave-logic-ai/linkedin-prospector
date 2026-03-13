"use client";

import { useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { NichesResponse } from "./icp-content";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface NicheDetailProps {
  nicheSlug: string;
}

// ---------------------------------------------------------------------------
// Extended niche data from the graph API for the detail page
// ---------------------------------------------------------------------------

interface NicheContact {
  url: string;
  name: string;
  company: string;
  title: string;
  goldScore: number;
  tier: string;
  persona: string;
  icpFit: number;
  networkHub: number;
}

interface NicheDetailData {
  niche: {
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
    topCompanies: { name: string; count: number }[];
    keywords: { keyword: string; count: number }[];
  };
  contacts: NicheContact[];
}

export function NicheDetail({ nicheSlug }: NicheDetailProps) {
  // We fetch the niches API plus a detailed contact list
  const { data: nichesData, isLoading: nichesLoading } =
    useSWR<NichesResponse>("/api/niches", fetcher);

  // Fetch graph data to get contact details for this cluster
  const { data: graphData, isLoading: graphLoading } = useSWR(
    "/api/graph/detail?cluster=" + encodeURIComponent(nicheSlug),
    // Falls back to using the niches endpoint since we may not have
    // a separate detail endpoint. We'll compute from niches.
    () =>
      fetch("/api/graph")
        .then((r) => r.json())
        .then(() => null),
    { revalidateOnFocus: false },
  );

  const niche = useMemo(() => {
    if (!nichesData) return null;
    return nichesData.niches.find((n) => n.id === nicheSlug) || null;
  }, [nichesData, nicheSlug]);

  const isLoading = nichesLoading || graphLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!niche) {
    return (
      <div className="space-y-6">
        <div>
          <Link
            href="/icp"
            className="text-xs text-primary hover:underline mb-2 inline-block"
          >
            Back to ICP & Niches
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">
            Niche not found
          </h1>
          <p className="text-muted-foreground text-sm">
            No cluster matching &quot;{nicheSlug}&quot; was found.
          </p>
        </div>
      </div>
    );
  }

  const goldPct =
    niche.contactCount > 0
      ? ((niche.goldCount / niche.contactCount) * 100).toFixed(1)
      : "0";
  const silverPct =
    niche.contactCount > 0
      ? ((niche.silverCount / niche.contactCount) * 100).toFixed(1)
      : "0";
  const bronzePct =
    niche.contactCount > 0
      ? ((niche.bronzeCount / niche.contactCount) * 100).toFixed(1)
      : "0";

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div>
        <Link
          href="/icp"
          className="text-xs text-primary hover:underline mb-1 inline-block"
        >
          Back to ICP & Niches
        </Link>
        <h1 className="text-2xl font-bold tracking-tight capitalize">
          {niche.label}
        </h1>
        <p className="text-muted-foreground text-sm">
          {niche.contactCount} contacts in this niche
        </p>
      </div>

      {/* Stats header */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <StatCard label="Contacts" value={niche.contactCount.toString()} />
        <StatCard
          label="Gold"
          value={niche.goldCount.toString()}
          accent="gold"
        />
        <StatCard
          label="Silver"
          value={niche.silverCount.toString()}
          accent="silver"
        />
        <StatCard
          label="Bronze"
          value={niche.bronzeCount.toString()}
          accent="bronze"
        />
        <StatCard
          label="Avg Score"
          value={(niche.avgGoldScore * 100).toFixed(0)}
        />
        <StatCard
          label="ICP Fit"
          value={(niche.avgIcpFit * 100).toFixed(0)}
        />
        <StatCard
          label="Hub Score"
          value={(niche.avgNetworkHub * 100).toFixed(0)}
        />
      </div>

      {/* Tier distribution bar (larger version) */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-2">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Tier Distribution
        </div>
        <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted">
          {niche.goldCount > 0 && (
            <div
              className="bg-[hsl(var(--tier-gold))] transition-all"
              style={{
                width: `${(niche.goldCount / niche.contactCount) * 100}%`,
              }}
            />
          )}
          {niche.silverCount > 0 && (
            <div
              className="bg-[hsl(var(--tier-silver))] transition-all"
              style={{
                width: `${(niche.silverCount / niche.contactCount) * 100}%`,
              }}
            />
          )}
          {niche.bronzeCount > 0 && (
            <div
              className="bg-[hsl(var(--tier-bronze))] transition-all"
              style={{
                width: `${(niche.bronzeCount / niche.contactCount) * 100}%`,
              }}
            />
          )}
          {niche.watchCount > 0 && (
            <div
              className="bg-[hsl(var(--tier-watch))] transition-all"
              style={{
                width: `${(niche.watchCount / niche.contactCount) * 100}%`,
              }}
            />
          )}
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>
            <span className="inline-block w-2 h-2 rounded-full bg-[hsl(var(--tier-gold))] mr-1" />
            Gold {goldPct}%
          </span>
          <span>
            <span className="inline-block w-2 h-2 rounded-full bg-[hsl(var(--tier-silver))] mr-1" />
            Silver {silverPct}%
          </span>
          <span>
            <span className="inline-block w-2 h-2 rounded-full bg-[hsl(var(--tier-bronze))] mr-1" />
            Bronze {bronzePct}%
          </span>
          <span>
            <span className="inline-block w-2 h-2 rounded-full bg-[hsl(var(--tier-watch))] mr-1" />
            Watch{" "}
            {niche.contactCount > 0
              ? ((niche.watchCount / niche.contactCount) * 100).toFixed(1)
              : 0}
            %
          </span>
        </div>
      </div>

      {/* Gold Score distribution - simple bar chart */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Gold Score Range Breakdown
        </div>
        <GoldScoreDistribution niche={niche} />
      </div>

      {/* Two columns: Top contacts + Top companies */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Contacts */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Top Contacts
          </div>
          <div className="space-y-2">
            {niche.topContacts.map((c, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-1"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{c.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {c.company}
                  </div>
                </div>
                <div className="text-sm font-semibold tabular-nums ml-3">
                  {(c.goldScore * 100).toFixed(0)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Companies */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Top Companies
          </div>
          <div className="space-y-2">
            {niche.topCompanies.map((co, i) => {
              const maxCount =
                niche.topCompanies[0]?.count || 1;
              const pct = (co.count / maxCount) * 100;
              return (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="capitalize truncate">{co.name}</span>
                    <span className="text-muted-foreground tabular-nums ml-2">
                      {co.count}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary/60"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Keywords */}
      {niche.keywords.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Keywords / Tags
          </div>
          <div className="flex flex-wrap gap-1.5">
            {niche.keywords.map((kw, i) => (
              <Badge key={i} variant="secondary" className="text-[10px]">
                {kw.keyword}
                <span className="ml-1 text-muted-foreground">{kw.count}</span>
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "gold" | "silver" | "bronze";
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-center">
      <div
        className={cn(
          "text-lg font-semibold tabular-nums",
          accent && `text-[hsl(var(--tier-${accent}))]`,
        )}
      >
        {value}
      </div>
      <div className="text-[9px] text-muted-foreground uppercase tracking-wider">
        {label}
      </div>
    </div>
  );
}

function GoldScoreDistribution({
  niche,
}: {
  niche: {
    goldCount: number;
    silverCount: number;
    bronzeCount: number;
    watchCount: number;
    contactCount: number;
  };
}) {
  // We approximate score ranges from tier distribution:
  // gold = 0.7-1.0, silver = 0.5-0.7, bronze = 0.3-0.5, watch = 0.0-0.3
  const ranges = [
    { label: "0.7 - 1.0", count: niche.goldCount, color: "bg-[hsl(var(--tier-gold))]" },
    {
      label: "0.5 - 0.7",
      count: niche.silverCount,
      color: "bg-[hsl(var(--tier-silver))]",
    },
    {
      label: "0.3 - 0.5",
      count: niche.bronzeCount,
      color: "bg-[hsl(var(--tier-bronze))]",
    },
    { label: "0.0 - 0.3", count: niche.watchCount, color: "bg-[hsl(var(--tier-watch))]" },
  ];

  const maxCount = Math.max(...ranges.map((r) => r.count), 1);

  return (
    <div className="space-y-2">
      {ranges.map((range) => (
        <div key={range.label} className="flex items-center gap-3">
          <span className="w-16 text-[10px] text-muted-foreground text-right tabular-nums">
            {range.label}
          </span>
          <div className="flex-1 h-4 bg-muted rounded overflow-hidden">
            <div
              className={cn("h-full rounded", range.color)}
              style={{
                width: `${(range.count / maxCount) * 100}%`,
              }}
            />
          </div>
          <span className="w-8 text-[10px] text-muted-foreground tabular-nums">
            {range.count}
          </span>
        </div>
      ))}
    </div>
  );
}
