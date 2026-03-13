import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

import type {
  GraphContact,
  GraphContactScores,
  ClusterData,
} from "@/types/contact";

// ---------------------------------------------------------------------------
// Data directory resolution
// ---------------------------------------------------------------------------

const PROJECT_ROOT = resolve(process.cwd(), "../../../");
const DATA_DIR = resolve(PROJECT_ROOT, ".linkedin-prospector/data");

interface GraphJson {
  contacts: Record<string, GraphContact>;
  companies: Record<string, unknown>;
  clusters: Record<string, ClusterData>;
  edges: unknown[];
  meta: {
    totalContacts: number;
    lastBuilt: string;
    lastScored: string;
    scoringVersion: number;
    lastBehavioralScored: string;
    lastEnriched: string;
    [key: string]: unknown;
  };
}

interface OutreachState {
  contacts: Record<string, { currentState: string }>;
  version: string;
  lastUpdated: string;
}

interface RateBudgetJson {
  operations: Record<string, { used: number; limit: number }>;
  window: string;
  lastReset: string;
}

// ---------------------------------------------------------------------------
// Safe JSON reader
// ---------------------------------------------------------------------------

function readJsonSafe<T>(filename: string): T | null {
  const filepath = resolve(DATA_DIR, filename);
  if (!existsSync(filepath)) return null;
  try {
    return JSON.parse(readFileSync(filepath, "utf-8")) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Suggested action builder
// ---------------------------------------------------------------------------

interface SuggestedAction {
  type: string;
  title: string;
  description: string;
  href: string;
  priority: number;
}

function buildSuggestedActions(
  graph: GraphJson,
  outreach: OutreachState | null
): SuggestedAction[] {
  const actions: SuggestedAction[] = [];
  const contactedUrls = new Set(
    Object.keys(outreach?.contacts ?? {})
  );

  // Count uncontacted gold contacts
  let uncontactedGold = 0;
  for (const [url, c] of Object.entries(graph.contacts)) {
    if (c.scores?.tier === "gold" && !contactedUrls.has(url)) {
      uncontactedGold++;
    }
  }

  if (uncontactedGold > 0) {
    actions.push({
      type: "uncontacted-gold",
      title: `${uncontactedGold} gold contacts awaiting outreach`,
      description:
        "High-value contacts have been identified but not yet contacted. Start outreach to maximize conversion.",
      href: "/contacts?tier=gold&outreach=none",
      priority: 1,
    });
  }

  // Check for companies with high penetration but no gold outreach
  const companies = graph.companies ?? {};
  const companyEntries = Object.entries(companies) as [
    string,
    { name: string; goldContacts: number; contacts: string[] }
  ][];
  const highPenCompanies = companyEntries
    .filter(([, co]) => co.goldContacts > 1)
    .slice(0, 3);

  for (const [, co] of highPenCompanies) {
    actions.push({
      type: "company-penetration",
      title: `${co.name}: ${co.goldContacts} gold contacts`,
      description: `Strong account penetration at ${co.name} with ${co.contacts.length} total contacts. Consider multi-threaded outreach.`,
      href: `/contacts?company=${encodeURIComponent(co.name)}`,
      priority: 2,
    });
  }

  // Cluster gap analysis
  const clusters = graph.clusters ?? {};
  for (const [label, cluster] of Object.entries(clusters)) {
    const goldInCluster = cluster.contacts.filter((url) => {
      const contact = graph.contacts[url];
      return contact?.scores?.tier === "gold";
    }).length;

    if (cluster.contacts.length > 20 && goldInCluster === 0) {
      actions.push({
        type: "cluster-gap",
        title: `"${label}" cluster has no gold contacts`,
        description: `${cluster.contacts.length} contacts in the ${label} cluster, but none scored gold. Review ICP alignment.`,
        href: `/network?cluster=${encodeURIComponent(label)}`,
        priority: 3,
      });
    }
  }

  // Stale follow-up check
  if (outreach) {
    const staleCount = Object.values(outreach.contacts).filter(
      (c) => c.currentState === "pending_response"
    ).length;
    if (staleCount > 0) {
      actions.push({
        type: "stale-followup",
        title: `${staleCount} pending responses need follow-up`,
        description:
          "Contacts that were messaged but have not responded. Consider a follow-up message.",
        href: "/outreach?state=pending_response",
        priority: 2,
      });
    }
  }

  return actions.sort((a, b) => a.priority - b.priority).slice(0, 5);
}

// ---------------------------------------------------------------------------
// GET /api/dashboard
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const graph = readJsonSafe<GraphJson>("graph.json");

    if (!graph || !graph.contacts) {
      return NextResponse.json(
        {
          error: "No graph data available",
          kpis: {
            totalContacts: 0,
            goldCount: 0,
            silverCount: 0,
            bronzeCount: 0,
            watchCount: 0,
            goldPercent: 0,
            silverPercent: 0,
            bronzePercent: 0,
          },
          topGoldContacts: [],
          suggestedActions: [],
          rateBudget: null,
          lastSync: null,
        },
        { status: 200 }
      );
    }

    const outreach = readJsonSafe<OutreachState>("outreach-state.json");
    const rateBudgetRaw = readJsonSafe<RateBudgetJson>("rate-budget.json");
    const contactedUrls = new Set(
      Object.keys(outreach?.contacts ?? {})
    );

    // -----------------------------------------------------------------------
    // KPI aggregation
    // -----------------------------------------------------------------------

    const contacts = Object.entries(graph.contacts);
    const total = contacts.length;

    const tierCounts = { gold: 0, silver: 0, bronze: 0, watch: 0 };
    for (const [, c] of contacts) {
      const tier = (c.scores?.tier || "watch") as keyof typeof tierCounts;
      if (tier in tierCounts) {
        tierCounts[tier]++;
      } else {
        tierCounts.watch++;
      }
    }

    const kpis = {
      totalContacts: total,
      goldCount: tierCounts.gold,
      silverCount: tierCounts.silver,
      bronzeCount: tierCounts.bronze,
      watchCount: tierCounts.watch,
      goldPercent: total > 0 ? Math.round((tierCounts.gold / total) * 1000) / 10 : 0,
      silverPercent: total > 0 ? Math.round((tierCounts.silver / total) * 1000) / 10 : 0,
      bronzePercent: total > 0 ? Math.round((tierCounts.bronze / total) * 1000) / 10 : 0,
    };

    // -----------------------------------------------------------------------
    // Top 5 gold contacts (by goldScore, not yet contacted)
    // -----------------------------------------------------------------------

    // Resolve cluster membership for a contact URL
    const urlToCluster = new Map<string, string>();
    for (const [label, cluster] of Object.entries(graph.clusters ?? {})) {
      for (const url of cluster.contacts ?? []) {
        if (!urlToCluster.has(url)) {
          urlToCluster.set(url, label);
        }
      }
    }

    const topGoldContacts = contacts
      .filter(([url, c]) => {
        const scores = c.scores as GraphContactScores | undefined;
        return scores?.tier === "gold" && !contactedUrls.has(url);
      })
      .sort((a, b) => {
        const aScore = (a[1].scores as GraphContactScores)?.goldScore ?? 0;
        const bScore = (b[1].scores as GraphContactScores)?.goldScore ?? 0;
        return bScore - aScore;
      })
      .slice(0, 5)
      .map(([url, c]) => {
        const scores = c.scores as GraphContactScores;
        const slug = url.split("/in/")[1]?.replace(/\/$/, "") || url;
        return {
          id: slug,
          name: c.enrichedName || c.name || "Unknown",
          title: c.currentRole || c.title || "",
          company: c.currentCompany || "",
          goldScore: scores?.goldScore ?? 0,
          icpFit: scores?.icpFit ?? 0,
          tier: "gold" as const,
          topCluster: urlToCluster.get(url) || "",
        };
      });

    // -----------------------------------------------------------------------
    // Suggested actions
    // -----------------------------------------------------------------------

    const suggestedActions = buildSuggestedActions(graph, outreach);

    // -----------------------------------------------------------------------
    // Rate budget
    // -----------------------------------------------------------------------

    let rateBudget: {
      operations: Record<string, { used: number; limit: number }>;
      overallPercent: number;
    } | null = null;

    if (rateBudgetRaw?.operations) {
      let totalUsed = 0;
      let totalLimit = 0;
      for (const op of Object.values(rateBudgetRaw.operations)) {
        totalUsed += op.used;
        totalLimit += op.limit;
      }
      rateBudget = {
        operations: rateBudgetRaw.operations,
        overallPercent:
          totalLimit > 0 ? Math.round((totalUsed / totalLimit) * 100) : 0,
      };
    }

    // -----------------------------------------------------------------------
    // Response
    // -----------------------------------------------------------------------

    return NextResponse.json({
      kpis,
      topGoldContacts,
      suggestedActions,
      rateBudget,
      lastSync: graph.meta?.lastScored || null,
    });
  } catch (err) {
    console.error("[dashboard] Failed to build dashboard data:", err);
    return NextResponse.json(
      { error: "Failed to load dashboard data" },
      { status: 500 }
    );
  }
}
