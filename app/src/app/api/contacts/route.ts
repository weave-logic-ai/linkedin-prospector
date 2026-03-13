import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync, statSync } from "fs";
import { resolve } from "path";

const PROJECT_ROOT = resolve(process.cwd(), "../../../");
const DATA_DIR = resolve(PROJECT_ROOT, ".linkedin-prospector/data");

let _graph: any = null;
let _graphMtime = 0;

let _outreach: any = null;
let _outreachMtime = 0;

let _notes: any = null;
let _notesMtime = 0;

function getGraph() {
  const path = resolve(DATA_DIR, "graph.json");
  if (!existsSync(path)) return null;
  const stat = statSync(path);
  if (_graph && stat.mtimeMs === _graphMtime) return _graph;
  _graph = JSON.parse(readFileSync(path, "utf-8"));
  _graphMtime = stat.mtimeMs;
  return _graph;
}

function getOutreachState() {
  const path = resolve(DATA_DIR, "outreach-state.json");
  if (!existsSync(path)) return { contacts: {} };
  const stat = statSync(path);
  if (_outreach && stat.mtimeMs === _outreachMtime) return _outreach;
  _outreach = JSON.parse(readFileSync(path, "utf-8"));
  _outreachMtime = stat.mtimeMs;
  return _outreach;
}

function getContactNotes(): Record<string, any> {
  const path = resolve(DATA_DIR, "contact-notes.json");
  if (!existsSync(path)) return {};
  const stat = statSync(path);
  if (_notes && stat.mtimeMs === _notesMtime) return _notes;
  _notes = JSON.parse(readFileSync(path, "utf-8"));
  _notesMtime = stat.mtimeMs;
  return _notes;
}

function extractSlug(url: string): string {
  return url.split("/in/")[1]?.replace(/\/$/, "").split("?")[0] || "";
}

interface ContactEntry {
  id: string;
  profileUrl: string;
  name: string;
  title: string;
  company: string;
  goldScore: number;
  icpFit: number;
  networkHub: number;
  behavioralScore: number;
  tier: string;
  persona: string;
  topCluster: string;
  degree: number;
  mutualConnections: number;
  location: string;
  outreachState: string | null;
  noteCount: number;
  deepScanned: boolean;
  deepScannedAt: string | null;
  deepScanResults: number;
}

function mapContact(url: string, c: any, outreachContacts: Record<string, any>, notesData: Record<string, any>): ContactEntry {
  // Look up outreach state - try both with and without trailing slash
  const outreach = outreachContacts[url] || outreachContacts[url + '/'] || outreachContacts[url.replace(/\/$/, '')] || null;

  const slug = extractSlug(url);
  const rawNotes = notesData[slug];
  let noteCount = 0;
  if (Array.isArray(rawNotes)) noteCount = rawNotes.length;
  else if (typeof rawNotes === "string" && rawNotes) noteCount = 1;

  return {
    id: slug,
    profileUrl: url,
    name: c.enrichedName || c.name || "",
    title: c.currentRole || c.title || "",
    company: c.currentCompany || "",
    goldScore: c.scores?.goldScore ?? 0,
    icpFit: c.scores?.icpFit ?? 0,
    networkHub: c.scores?.networkHub ?? 0,
    behavioralScore: c.behavioralScore ?? 0,
    tier: c.scores?.tier || "watch",
    persona: c.personaType || "",
    topCluster: c.tags?.[0] || "",
    degree: c.degree ?? 2,
    mutualConnections: c.mutualConnections ?? 0,
    location: c.enrichedLocation || c.location || "",
    outreachState: outreach?.currentState ?? null,
    noteCount,
    deepScanned: c.deepScanned ?? false,
    deepScannedAt: c.deepScannedAt ?? null,
    deepScanResults: c.deepScanResults ?? 0,
  };
}

export async function GET(request: NextRequest) {
  const graph = getGraph();
  if (!graph) {
    return NextResponse.json({ error: "Graph data not found" }, { status: 404 });
  }

  const { searchParams } = request.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));
  const sort = searchParams.get("sort") || "goldScore";
  const order = searchParams.get("order") || "desc";
  const tierFilter = searchParams.get("tier")?.split(",").filter(Boolean) || [];
  const clusterFilter = searchParams.get("cluster")?.split(",").filter(Boolean) || [];
  const degreeFilter = searchParams.get("degree")?.split(",").map(Number).filter(Boolean) || [];
  const search = searchParams.get("search")?.toLowerCase() || "";

  const outreachData = getOutreachState();
  const outreachContacts = outreachData.contacts || {};
  const notesData = getContactNotes();

  const contacts: ContactEntry[] = [];
  for (const [url, raw] of Object.entries(graph.contacts)) {
    const c = raw as any;
    const mapped = mapContact(url, c, outreachContacts, notesData);

    // Apply filters
    if (tierFilter.length > 0 && !tierFilter.includes(mapped.tier)) continue;
    if (degreeFilter.length > 0 && !degreeFilter.includes(mapped.degree)) continue;
    if (clusterFilter.length > 0) {
      const tags = (c.tags || []) as string[];
      if (!clusterFilter.some((cl: string) => tags.includes(cl))) continue;
    }
    if (search) {
      const haystack = `${mapped.name} ${mapped.title} ${mapped.company} ${c.headline || ""}`.toLowerCase();
      if (!haystack.includes(search)) continue;
    }

    contacts.push(mapped);
  }

  // Sort
  const sortKey = sort as keyof ContactEntry;
  contacts.sort((a, b) => {
    const aVal = a[sortKey] ?? 0;
    const bVal = b[sortKey] ?? 0;
    if (typeof aVal === "string" && typeof bVal === "string") {
      return order === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    const aNum = Number(aVal) || 0;
    const bNum = Number(bVal) || 0;
    return order === "asc" ? aNum - bNum : bNum - aNum;
  });

  const total = contacts.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const paged = contacts.slice(start, start + pageSize);

  return NextResponse.json({
    contacts: paged,
    total,
    page,
    pageSize,
    totalPages,
  });
}
