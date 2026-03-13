import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync, statSync } from "fs";
import { resolve } from "path";

const PROJECT_ROOT = resolve(process.cwd(), "../../../");
const DATA_DIR = resolve(PROJECT_ROOT, ".linkedin-prospector/data");

let _graph: any = null;
let _graphMtime = 0;

function getGraph() {
  const path = resolve(DATA_DIR, "graph.json");
  if (!existsSync(path)) return null;
  const stat = statSync(path);
  if (_graph && stat.mtimeMs === _graphMtime) return _graph;
  _graph = JSON.parse(readFileSync(path, "utf-8"));
  _graphMtime = stat.mtimeMs;
  return _graph;
}

function extractSlug(url: string): string {
  return url.split("/in/")[1]?.replace(/\/$/, "").split("?")[0] || "";
}

export async function GET(request: NextRequest) {
  const graph = getGraph();
  if (!graph) {
    return NextResponse.json({ error: "Graph data not found" }, { status: 404 });
  }

  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q")?.toLowerCase() || "";
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));

  if (!q) {
    return NextResponse.json({ results: [], total: 0 });
  }

  const results: Array<{
    id: string;
    name: string;
    title: string;
    company: string;
    goldScore: number;
    tier: string;
    degree: number;
  }> = [];

  for (const [url, raw] of Object.entries(graph.contacts)) {
    const c = raw as any;
    const name = c.enrichedName || c.name || "";
    const title = c.currentRole || c.title || "";
    const company = c.currentCompany || "";
    const headline = c.headline || "";

    const haystack = `${name} ${title} ${company} ${headline}`.toLowerCase();
    if (!haystack.includes(q)) continue;

    results.push({
      id: extractSlug(url),
      name,
      title,
      company,
      goldScore: c.scores?.goldScore ?? 0,
      tier: c.scores?.tier || "watch",
      degree: c.degree ?? 2,
    });
  }

  // Sort by goldScore descending
  results.sort((a, b) => b.goldScore - a.goldScore);

  return NextResponse.json({
    results: results.slice(0, limit),
    total: results.length,
  });
}
