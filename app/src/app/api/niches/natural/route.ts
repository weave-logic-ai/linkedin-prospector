import { NextResponse } from "next/server";
import { readFileSync, existsSync, statSync } from "fs";
import { resolve } from "path";

const PROJECT_ROOT = resolve(process.cwd(), "../../../");
const DATA_DIR = resolve(PROJECT_ROOT, ".linkedin-prospector/data");

// ---------------------------------------------------------------------------
// Cached graph loader
// ---------------------------------------------------------------------------

let _graph: GraphJson | null = null;
let _graphMtime = 0;

interface GraphJson {
  contacts: Record<string, GraphContact>;
  edges: unknown[];
  clusters: Record<string, ClusterEntry>;
  companies: Record<string, CompanyEntry>;
  meta: Record<string, unknown>;
}

interface GraphContact {
  name: string;
  enrichedName?: string;
  headline?: string;
  currentCompany?: string;
  currentTitle?: string;
  personaType: string;
  degree?: number;
  scores: {
    goldScore: number;
    tier: string;
    icpFit: number;
    networkHub: number;
    relationshipStrength?: number;
  };
  tags: string[];
}

interface ClusterEntry {
  label: string;
  keywords: string[];
  contacts: string[];
  hubContacts: string[];
}

interface CompanyEntry {
  name: string;
  contacts: string[];
}

function getGraph(): GraphJson | null {
  const path = resolve(DATA_DIR, "graph.json");
  if (!existsSync(path)) return null;
  const stat = statSync(path);
  if (_graph && stat.mtimeMs === _graphMtime) return _graph;
  _graph = JSON.parse(readFileSync(path, "utf-8"));
  _graphMtime = stat.mtimeMs;
  return _graph;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function topN<T>(map: Map<string, T>, n: number, sortBy: (v: T) => number): { key: string; value: T }[] {
  return [...map.entries()]
    .sort((a, b) => sortBy(b[1]) - sortBy(a[1]))
    .slice(0, n)
    .map(([key, value]) => ({ key, value }));
}

function titleToRole(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("ceo") || t.includes("chief executive")) return "CEO / Founder";
  if (t.includes("cto") || t.includes("chief technology")) return "CTO / Technical Leader";
  if (t.includes("vp") || t.includes("vice president")) return "VP-Level Executive";
  if (t.includes("director")) return "Director";
  if (t.includes("founder") || t.includes("co-founder")) return "CEO / Founder";
  if (t.includes("owner")) return "Business Owner";
  if (t.includes("manager")) return "Manager";
  if (t.includes("head of") || t.includes("head,")) return "Department Head";
  if (t.includes("developer") || t.includes("engineer")) return "Technical IC";
  if (t.includes("consultant") || t.includes("advisor")) return "Consultant / Advisor";
  return "Other";
}

// ---------------------------------------------------------------------------
// GET /api/niches/natural
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const graph = getGraph();
    if (!graph) {
      return NextResponse.json({ error: "graph.json not found" }, { status: 404 });
    }

    // Gather all gold contacts
    const goldContacts: (GraphContact & { url: string })[] = [];
    const allContacts = Object.entries(graph.contacts);

    for (const [url, c] of allContacts) {
      if (c.scores.tier === "gold") {
        goldContacts.push({ ...c, url });
      }
    }

    if (goldContacts.length === 0) {
      return NextResponse.json({
        naturalNiche: null,
        message: "No gold contacts found. Run scoring first.",
      });
    }

    // --- Cluster analysis: rank by gold density & count ---
    const clusterStats: Map<string, {
      label: string;
      total: number;
      goldCount: number;
      goldDensity: number;
      avgGoldScore: number;
      buyerCount: number;
      warmLeadCount: number;
    }> = new Map();

    for (const [clusterName, clusterData] of Object.entries(graph.clusters)) {
      let goldCount = 0;
      let totalGoldScore = 0;
      let buyerCount = 0;
      let warmLeadCount = 0;

      for (const url of clusterData.contacts) {
        const c = graph.contacts[url];
        if (!c) continue;
        if (c.scores.tier === "gold") {
          goldCount++;
          totalGoldScore += c.scores.goldScore;
          if (c.personaType === "buyer") buyerCount++;
          if (c.personaType === "warm-lead") warmLeadCount++;
        }
      }

      const total = clusterData.contacts.length;
      clusterStats.set(clusterName, {
        label: clusterData.label,
        total,
        goldCount,
        goldDensity: total > 0 ? goldCount / total : 0,
        avgGoldScore: goldCount > 0 ? totalGoldScore / goldCount : 0,
        buyerCount,
        warmLeadCount,
      });
    }

    // Rank clusters by composite score: goldDensity * 0.5 + normalized goldCount * 0.3 + avgGoldScore * 0.2
    const maxGoldCount = Math.max(...[...clusterStats.values()].map((s) => s.goldCount), 1);
    const rankedClusters = topN(clusterStats, clusterStats.size, (v) =>
      v.goldDensity * 0.5 + (v.goldCount / maxGoldCount) * 0.3 + v.avgGoldScore * 0.2
    ).map(({ key, value }) => ({
      id: key,
      ...value,
      compositeScore: value.goldDensity * 0.5 + (value.goldCount / maxGoldCount) * 0.3 + value.avgGoldScore * 0.2,
    }));

    // --- Tag analysis across gold contacts ---
    const tagCounts = new Map<string, number>();
    const personaCounts = new Map<string, number>();
    const roleCounts = new Map<string, number>();
    const companyCounts = new Map<string, number>();
    const industryCounts = new Map<string, number>();

    for (const c of goldContacts) {
      // Tags
      if (c.tags) {
        for (const tag of c.tags) {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        }
      }
      // Persona
      if (c.personaType) {
        personaCounts.set(c.personaType, (personaCounts.get(c.personaType) || 0) + 1);
      }
      // Role from title
      if (c.currentTitle || c.headline) {
        const role = titleToRole(c.currentTitle || c.headline || "");
        roleCounts.set(role, (roleCounts.get(role) || 0) + 1);
      }
      // Company — clean scraping artifacts
      if (c.currentCompany) {
        let co = c.currentCompany.replace(/\s*·\s*(Full-time|Part-time|Contract|Freelance|Self-employed|Internship)$/i, "").trim();
        // Skip entries that are just durations (e.g. "24 yrs", "7 yrs 6 mos")
        if (co && !/^\d+\s*(yr|mo|day)/i.test(co)) {
          companyCounts.set(co, (companyCounts.get(co) || 0) + 1);
        }
      }
    }

    // Map top tags to industry signals
    const industryTags: Record<string, string> = {
      ecommerce: "E-Commerce",
      "adobe-commerce": "E-Commerce (Adobe/Magento)",
      shopify: "E-Commerce (Shopify)",
      dtc: "DTC / Direct-to-Consumer",
      retail: "Retail",
      saas: "SaaS",
      agency: "Digital Agency",
      php: "Web Development (PHP)",
      "tech-leader": "Technology Leadership",
    };

    for (const [tag, count] of tagCounts) {
      if (industryTags[tag]) {
        industryCounts.set(industryTags[tag], (industryCounts.get(industryTags[tag]) || 0) + count);
      }
    }

    // --- Build derived ICP profile ---
    const topTags = topN(tagCounts, 8, (v) => v).map(({ key, value }) => ({ tag: key, count: value }));
    const topPersonas = topN(personaCounts, 5, (v) => v).map(({ key, value }) => ({ persona: key, count: value }));
    const topRoles = topN(roleCounts, 5, (v) => v).map(({ key, value }) => ({ role: key, count: value }));
    const topCompanies = topN(companyCounts, 8, (v) => v).map(({ key, value }) => ({ company: key, count: value }));
    const topIndustries = topN(industryCounts, 5, (v) => v).map(({ key, value }) => ({ industry: key, count: value }));

    // Compute avg scores for gold contacts
    const avgScores = {
      goldScore: goldContacts.reduce((s, c) => s + c.scores.goldScore, 0) / goldContacts.length,
      icpFit: goldContacts.reduce((s, c) => s + c.scores.icpFit, 0) / goldContacts.length,
      networkHub: goldContacts.reduce((s, c) => s + c.scores.networkHub, 0) / goldContacts.length,
    };

    // Determine primary niche from top cluster
    const primaryCluster = rankedClusters[0];
    const secondaryCluster = rankedClusters.length > 1 ? rankedClusters[1] : null;

    // Build the natural niche label
    const nicheKeywords: string[] = [];
    if (topIndustries.length > 0) nicheKeywords.push(topIndustries[0].industry);
    if (topRoles.length > 0) nicheKeywords.push(topRoles[0].role);

    return NextResponse.json({
      naturalNiche: {
        primaryCluster: primaryCluster
          ? { id: primaryCluster.id, label: primaryCluster.label, goldDensity: primaryCluster.goldDensity, goldCount: primaryCluster.goldCount, compositeScore: primaryCluster.compositeScore }
          : null,
        secondaryCluster: secondaryCluster
          ? { id: secondaryCluster.id, label: secondaryCluster.label, goldDensity: secondaryCluster.goldDensity, goldCount: secondaryCluster.goldCount, compositeScore: secondaryCluster.compositeScore }
          : null,
        allClusters: rankedClusters.map((c) => ({
          id: c.id,
          label: c.label,
          goldDensity: Math.round(c.goldDensity * 1000) / 1000,
          goldCount: c.goldCount,
          total: c.total,
          avgGoldScore: Math.round(c.avgGoldScore * 1000) / 1000,
          buyerCount: c.buyerCount,
          warmLeadCount: c.warmLeadCount,
          compositeScore: Math.round(c.compositeScore * 1000) / 1000,
        })),
        nicheLabel: nicheKeywords.join(" — ") || "General Network",
      },
      derivedICP: {
        goldContactCount: goldContacts.length,
        totalContacts: allContacts.length,
        goldPercentage: Math.round((goldContacts.length / allContacts.length) * 1000) / 10,
        avgScores: {
          goldScore: Math.round(avgScores.goldScore * 1000) / 1000,
          icpFit: Math.round(avgScores.icpFit * 1000) / 1000,
          networkHub: Math.round(avgScores.networkHub * 1000) / 1000,
        },
        topTags,
        topPersonas,
        topRoles,
        topCompanies,
        topIndustries,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
