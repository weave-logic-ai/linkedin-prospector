"use client";

import useSWR from "swr";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { GoldContactsCard } from "@/components/dashboard/gold-contacts-card";
import { SuggestedActions } from "@/components/dashboard/suggested-actions";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { RateBudgetBar } from "@/components/dashboard/rate-budget-bar";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { Card, CardContent } from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DashboardKpis {
  totalContacts: number;
  goldCount: number;
  silverCount: number;
  bronzeCount: number;
  watchCount: number;
  goldPercent: number;
  silverPercent: number;
  bronzePercent: number;
}

interface GoldContact {
  id: string;
  name: string;
  title: string;
  company: string;
  goldScore: number;
  icpFit: number;
  tier: string;
  topCluster: string;
}

interface SuggestedAction {
  type: string;
  title: string;
  description: string;
  href: string;
  priority: number;
}

interface RateBudget {
  operations: Record<string, { used: number; limit: number }>;
  overallPercent: number;
}

interface DashboardData {
  kpis: DashboardKpis;
  topGoldContacts: GoldContact[];
  suggestedActions: SuggestedAction[];
  rateBudget: RateBudget | null;
  lastSync: string | null;
  error?: string;
}

// ---------------------------------------------------------------------------
// SWR fetcher
// ---------------------------------------------------------------------------

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DashboardContent() {
  const { data, error, isLoading } = useSWR<DashboardData>(
    "/api/dashboard",
    fetcher,
    { refreshInterval: 120000, revalidateOnFocus: true }
  );

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-destructive">
            Failed to load dashboard data. Please try refreshing.
          </p>
        </CardContent>
      </Card>
    );
  }

  const kpis = data?.kpis ?? {
    totalContacts: 0,
    goldCount: 0,
    silverCount: 0,
    bronzeCount: 0,
    watchCount: 0,
    goldPercent: 0,
    silverPercent: 0,
    bronzePercent: 0,
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Dashboard</h1>
          {data?.lastSync && (
            <p className="text-[11px] text-muted-foreground">
              Last scored:{" "}
              {new Date(data.lastSync).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>
      </div>

      {/* Row 1: KPI cards */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          label="Total Contacts"
          value={kpis.totalContacts}
        />
        <KpiCard
          label="Gold Tier"
          value={kpis.goldCount}
          secondary={`${kpis.goldPercent}% of network`}
          accent="gold"
        />
        <KpiCard
          label="Silver Tier"
          value={kpis.silverCount}
          secondary={`${kpis.silverPercent}% of network`}
          accent="silver"
        />
        <KpiCard
          label="Bronze Tier"
          value={kpis.bronzeCount}
          secondary={`${kpis.bronzePercent}% of network`}
          accent="bronze"
        />
      </div>

      {/* Row 2: Rate budget bar (span 4) */}
      {data?.rateBudget && (
        <div className="grid grid-cols-4 gap-4">
          <RateBudgetBar budget={data.rateBudget} />
        </div>
      )}

      {/* Row 3: Gold contacts + Suggested actions */}
      <div className="grid grid-cols-4 gap-4">
        <GoldContactsCard contacts={data?.topGoldContacts ?? []} />
        <SuggestedActions actions={data?.suggestedActions ?? []} />
      </div>

      {/* Row 4: Quick actions */}
      <div className="grid grid-cols-4 gap-4">
        <QuickActions />
      </div>
    </div>
  );
}
