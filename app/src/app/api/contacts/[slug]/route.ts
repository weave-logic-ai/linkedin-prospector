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

  // Try exact match first, then try with trailing slash
  let contact = graph.contacts[profileUrl] || graph.contacts[profileUrl + "/"];
  let matchedUrl = contact ? (graph.contacts[profileUrl] ? profileUrl : profileUrl + "/") : null;

  if (!contact) {
    // Fallback: search through all contacts for slug match
    for (const [url, c] of Object.entries(graph.contacts)) {
      if (extractSlug(url) === slug) {
        contact = c;
        matchedUrl = url;
        break;
      }
    }
  }

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const c = contact as any;

  // Build edges - top 20 connections
  const edges: Array<{ targetId: string; targetName: string; type: string; weight: number }> = [];
  if (graph.edges) {
    for (const edge of graph.edges) {
      if (edge.source === matchedUrl || edge.target === matchedUrl) {
        const otherUrl = edge.source === matchedUrl ? edge.target : edge.source;
        const other = graph.contacts[otherUrl];
        edges.push({
          targetId: extractSlug(otherUrl),
          targetName: other ? (other as any).enrichedName || (other as any).name || extractSlug(otherUrl) : extractSlug(otherUrl),
          type: edge.type || "connection",
          weight: edge.weight ?? 0,
        });
      }
      if (edges.length >= 20) break;
    }
  }

  // Sort edges by weight descending
  edges.sort((a, b) => b.weight - a.weight);

  // Find company contacts
  const companyContacts: Array<{
    id: string;
    name: string;
    title: string;
    goldScore: number;
    tier: string;
  }> = [];
  if (c.companyId) {
    for (const [url, raw] of Object.entries(graph.contacts)) {
      const other = raw as any;
      if (url === matchedUrl) continue;
      if (other.companyId === c.companyId) {
        companyContacts.push({
          id: extractSlug(url),
          name: other.enrichedName || other.name || "",
          title: other.currentRole || other.title || "",
          goldScore: other.scores?.goldScore ?? 0,
          tier: other.scores?.tier || "watch",
        });
        if (companyContacts.length >= 10) break;
      }
    }
  }

  return NextResponse.json({
    contact: {
      profileUrl: matchedUrl,
      name: c.enrichedName || c.name || "",
      title: c.currentRole || c.title || "",
      company: c.currentCompany || "",
      headline: c.headline || "",
      about: c.about || "",
      location: c.enrichedLocation || c.location || "",
      goldScore: c.scores?.goldScore ?? 0,
      icpFit: c.scores?.icpFit ?? 0,
      networkHub: c.scores?.networkHub ?? 0,
      relationshipStrength: c.scores?.relationshipStrength ?? 0,
      signalBoost: c.scores?.signalBoost ?? 0,
      skillsRelevance: c.scores?.skillsRelevance ?? null,
      networkProximity: c.scores?.networkProximity ?? 0,
      behavioralScore: c.behavioralScore ?? 0,
      referralLikelihood: c.referralTier ? 1 : 0,
      tier: c.scores?.tier || "watch",
      persona: c.personaType || "",
      behavioralPersona: c.behavioralPersona || "",
      referralTier: c.referralTier || null,
      referralPersona: c.referralPersona || null,
      degree: c.degree ?? 2,
      mutualConnections: c.mutualConnections ?? 0,
      enriched: c.enriched ?? false,
      clusters: c.tags || [],
      tags: c.tags || [],
      accountPenetration: c.accountPenetration || null,
    },
    edges,
    companyContacts,
  });
}
