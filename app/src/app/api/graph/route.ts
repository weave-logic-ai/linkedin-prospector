import { NextRequest, NextResponse } from "next/server";
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
  edges: GraphEdge[];
  clusters: Record<string, ClusterEntry>;
  companies: Record<string, unknown>;
  meta: Record<string, unknown>;
}

interface GraphContact {
  name: string;
  enrichedName?: string;
  currentRole?: string;
  currentCompany?: string;
  personaType: string;
  degree: number;
  scores: {
    goldScore: number;
    tier: string;
    icpFit: number;
    networkHub: number;
  };
  tags: string[];
}

interface GraphEdge {
  source: string;
  target: string;
  type: string;
  weight: number;
}

interface ClusterEntry {
  label: string;
  keywords: string[];
  contacts: string[];
  hubContacts: string[];
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
// KNN edge pruning: for each node, keep only top K edges by weight
// ---------------------------------------------------------------------------

function pruneEdgesToKNN(
  nodes: Set<string>,
  edges: GraphEdge[],
  k = 8,
): GraphEdge[] {
  const nodeEdges = new Map<string, GraphEdge[]>();

  for (const e of edges) {
    if (!nodes.has(e.source) || !nodes.has(e.target)) continue;
    if (!nodeEdges.has(e.source)) nodeEdges.set(e.source, []);
    if (!nodeEdges.has(e.target)) nodeEdges.set(e.target, []);
    nodeEdges.get(e.source)!.push(e);
    nodeEdges.get(e.target)!.push(e);
  }

  const kept = new Set<string>();
  for (const [, nodeEdgeList] of nodeEdges) {
    nodeEdgeList.sort((a, b) => b.weight - a.weight);
    for (const e of nodeEdgeList.slice(0, k)) {
      kept.add(`${e.source}|${e.target}`);
    }
  }

  return edges.filter(
    (e) =>
      kept.has(`${e.source}|${e.target}`) ||
      kept.has(`${e.target}|${e.source}`),
  );
}

// ---------------------------------------------------------------------------
// Extract slug from LinkedIn URL
// ---------------------------------------------------------------------------

function extractSlug(url: string): string {
  const match = url.match(/linkedin\.com\/in\/([^/]+)/);
  return match ? match[1] : url;
}

// ---------------------------------------------------------------------------
// GET /api/graph
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const graph = getGraph();
    if (!graph) {
      return NextResponse.json(
        { error: "graph.json not found" },
        { status: 404 },
      );
    }

    const { searchParams } = request.nextUrl;
    const maxNodes = Math.min(500, Math.max(50, parseInt(searchParams.get("maxNodes") || "200")));
    const k = Math.min(20, Math.max(2, parseInt(searchParams.get("k") || "8")));

    // Build reverse cluster map: contact URL -> primary cluster name
    const contactCluster = new Map<string, string>();
    for (const [clusterName, clusterData] of Object.entries(graph.clusters)) {
      for (const url of clusterData.contacts) {
        // First cluster wins as primary
        if (!contactCluster.has(url)) {
          contactCluster.set(url, clusterName);
        }
      }
    }

    // Build cluster index for numeric IDs
    const clusterNames = Object.keys(graph.clusters);
    const clusterIndex = new Map<string, number>();
    clusterNames.forEach((name, i) => clusterIndex.set(name, i));

    // Sort contacts by goldScore desc, take top maxNodes
    const sorted = Object.entries(graph.contacts)
      .map(([url, c]) => ({ url, contact: c }))
      .sort((a, b) => b.contact.scores.goldScore - a.contact.scores.goldScore)
      .slice(0, maxNodes);

    const nodeSet = new Set(sorted.map((s) => s.url));

    // Build nodes
    const nodes = sorted.map(({ url, contact }) => {
      const clusterName = contactCluster.get(url) || "unclustered";
      return {
        id: url,
        slug: extractSlug(url),
        name: contact.enrichedName || contact.name,
        company: contact.currentCompany || "",
        goldScore: contact.scores.goldScore,
        tier: contact.scores.tier,
        persona: contact.personaType,
        cluster: clusterIndex.get(clusterName) ?? -1,
        clusterLabel: clusterName,
        degree: contact.degree,
      };
    });

    // Prune edges
    const prunedEdges = pruneEdgesToKNN(nodeSet, graph.edges, k);
    const edges = prunedEdges.map((e) => ({
      source: e.source,
      target: e.target,
      type: e.type,
      weight: e.weight,
    }));

    // Cluster summaries
    const clusters = clusterNames.map((name, i) => {
      const clusterData = graph.clusters[name];
      const clusterContacts = clusterData.contacts;
      let goldCount = 0;
      for (const url of clusterContacts) {
        const c = graph.contacts[url];
        if (c && c.scores.tier === "gold") goldCount++;
      }

      // Resolve hub contact names
      const hubNames: string[] = [];
      for (const url of clusterData.hubContacts || []) {
        const c = graph.contacts[url];
        if (c) {
          hubNames.push(c.enrichedName || c.name);
        }
      }

      return {
        id: i,
        label: name,
        count: clusterContacts.length,
        goldCount,
        keywords: clusterData.keywords || [],
        hubNames,
      };
    });

    // Stats
    const totalContacts = Object.keys(graph.contacts).length;
    const totalEdges = graph.edges.length;
    const density =
      totalContacts > 1
        ? (2 * totalEdges) / (totalContacts * (totalContacts - 1))
        : 0;

    return NextResponse.json({
      nodes,
      edges,
      clusters,
      stats: {
        totalNodes: totalContacts,
        totalEdges,
        density: Math.round(density * 10000) / 10000,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
