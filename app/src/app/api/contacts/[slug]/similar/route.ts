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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const graph = getGraph();
  if (!graph) {
    return NextResponse.json({ error: "Graph data not found" }, { status: 404 });
  }

  const profileUrl = `https://www.linkedin.com/in/${slug}`;
  let contact = graph.contacts[profileUrl] || graph.contacts[profileUrl + "/"];

  if (!contact) {
    for (const [url, c] of Object.entries(graph.contacts)) {
      if (extractSlug(url) === slug) {
        contact = c;
        break;
      }
    }
  }

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const c = contact as any;
  const targetGold = c.scores?.goldScore ?? 0;
  const targetIcp = c.scores?.icpFit ?? 0;
  const targetHub = c.scores?.networkHub ?? 0;

  // Euclidean distance in score space
  const candidates: Array<{ url: string; distance: number }> = [];
  for (const [url, raw] of Object.entries(graph.contacts)) {
    if (extractSlug(url) === slug) continue;
    const other = raw as any;
    const gold = other.scores?.goldScore ?? 0;
    const icp = other.scores?.icpFit ?? 0;
    const hub = other.scores?.networkHub ?? 0;
    const dist = Math.sqrt(
      (gold - targetGold) ** 2 +
      (icp - targetIcp) ** 2 +
      (hub - targetHub) ** 2
    );
    candidates.push({ url, distance: dist });
  }

  candidates.sort((a, b) => a.distance - b.distance);
  const top5 = candidates.slice(0, 5);

  const similar = top5.map(({ url, distance }) => {
    const other = graph.contacts[url] as any;
    return {
      id: extractSlug(url),
      name: other.enrichedName || other.name || "",
      title: other.currentRole || other.title || "",
      company: other.currentCompany || "",
      goldScore: other.scores?.goldScore ?? 0,
      icpFit: other.scores?.icpFit ?? 0,
      tier: other.scores?.tier || "watch",
      distance: Math.round(distance * 1000) / 1000,
    };
  });

  return NextResponse.json({ similar });
}
