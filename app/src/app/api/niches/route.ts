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
  currentCompany?: string;
  personaType: string;
  scores: {
    goldScore: number;
    tier: string;
    icpFit: number;
    networkHub: number;
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
// GET /api/niches
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const graph = getGraph();
    if (!graph) {
      return NextResponse.json(
        { error: "graph.json not found" },
        { status: 404 },
      );
    }

    const niches = Object.entries(graph.clusters).map(
      ([clusterName, clusterData]) => {
        let goldCount = 0;
        let silverCount = 0;
        let bronzeCount = 0;
        let watchCount = 0;
        let totalGoldScore = 0;
        let totalIcpFit = 0;
        let totalNetworkHub = 0;
        let validCount = 0;

        const topContactsList: {
          name: string;
          goldScore: number;
          company: string;
        }[] = [];
        const companyCount = new Map<string, number>();
        const keywordCount = new Map<string, number>();

        for (const url of clusterData.contacts) {
          const c = graph.contacts[url];
          if (!c) continue;

          validCount++;
          const tier = c.scores.tier;
          if (tier === "gold") goldCount++;
          else if (tier === "silver") silverCount++;
          else if (tier === "bronze") bronzeCount++;
          else watchCount++;

          totalGoldScore += c.scores.goldScore;
          totalIcpFit += c.scores.icpFit;
          totalNetworkHub += c.scores.networkHub;

          topContactsList.push({
            name: c.enrichedName || c.name,
            goldScore: c.scores.goldScore,
            company: c.currentCompany || "",
          });

          // Company aggregation
          if (c.currentCompany) {
            const co = c.currentCompany.toLowerCase().trim();
            companyCount.set(co, (companyCount.get(co) || 0) + 1);
          }

          // Tag/keyword aggregation
          if (c.tags) {
            for (const tag of c.tags) {
              keywordCount.set(tag, (keywordCount.get(tag) || 0) + 1);
            }
          }
        }

        // Sort top contacts by gold score
        topContactsList.sort((a, b) => b.goldScore - a.goldScore);
        const topContacts = topContactsList.slice(0, 3);

        // Top companies
        const topCompanies = [...companyCount.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([name, count]) => ({ name, count }));

        // Keywords
        const keywords = [...keywordCount.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([keyword, count]) => ({ keyword, count }));

        const contactCount = clusterData.contacts.length;
        const goldDensity = contactCount > 0 ? goldCount / contactCount : 0;
        const avgGoldScore = validCount > 0 ? totalGoldScore / validCount : 0;
        const avgIcpFit = validCount > 0 ? totalIcpFit / validCount : 0;
        const avgNetworkHub =
          validCount > 0 ? totalNetworkHub / validCount : 0;

        return {
          id: clusterName,
          label: clusterData.label,
          contactCount,
          goldCount,
          silverCount,
          bronzeCount,
          watchCount,
          avgGoldScore: Math.round(avgGoldScore * 1000) / 1000,
          avgIcpFit: Math.round(avgIcpFit * 1000) / 1000,
          avgNetworkHub: Math.round(avgNetworkHub * 1000) / 1000,
          goldDensity: Math.round(goldDensity * 1000) / 1000,
          topContacts,
          topCompanies,
          keywords,
        };
      },
    );

    // Sort by gold density descending
    niches.sort((a, b) => b.goldDensity - a.goldDensity);

    const totalContacts = niches.reduce((s, n) => s + n.contactCount, 0);
    const totalNiches = niches.length;
    const avgGoldDensity =
      totalNiches > 0
        ? niches.reduce((s, n) => s + n.goldDensity, 0) / totalNiches
        : 0;

    return NextResponse.json({
      niches,
      summary: {
        totalNiches,
        totalContacts,
        avgGoldDensity: Math.round(avgGoldDensity * 1000) / 1000,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
