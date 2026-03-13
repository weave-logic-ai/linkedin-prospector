import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const PROJECT_ROOT = resolve(process.cwd(), "../../../");
const DATA_DIR = resolve(PROJECT_ROOT, ".linkedin-prospector/data");

export const dynamic = "force-dynamic";

interface OutreachContact {
  currentState: string;
  history: Array<{
    from: string;
    to: string;
    timestamp: string;
  }>;
  createdAt: string;
}

interface OutreachState {
  contacts: Record<string, OutreachContact>;
  version: string;
  lastUpdated: string;
}

// Read graph to get contact names
let _graph: Record<string, unknown> | null = null;
let _graphMtime = 0;

function getGraph(): Record<string, unknown> | null {
  const path = resolve(DATA_DIR, "graph.json");
  if (!existsSync(path)) return null;
  try {
    const { statSync } = require("fs");
    const stat = statSync(path);
    if (_graph && stat.mtimeMs === _graphMtime) return _graph;
    _graph = JSON.parse(readFileSync(path, "utf-8"));
    _graphMtime = stat.mtimeMs;
    return _graph;
  } catch {
    return null;
  }
}

function extractSlug(url: string): string {
  return url.split("/in/")[1]?.replace(/\/$/, "").split("?")[0] || url;
}

export async function GET() {
  try {
    const statePath = resolve(DATA_DIR, "outreach-state.json");

    if (!existsSync(statePath)) {
      return NextResponse.json({
        states: {},
        total: 0,
        funnel: [
          { stage: "planned", count: 0 },
          { stage: "sent", count: 0 },
          { stage: "responded", count: 0 },
          { stage: "engaged", count: 0 },
          { stage: "converted", count: 0 },
        ],
        contacts: [],
      });
    }

    const raw = readFileSync(statePath, "utf-8");
    const state: OutreachState = JSON.parse(raw);

    // Count states
    const stateCounts: Record<string, number> = {};
    const allStates = [
      "planned",
      "sent",
      "pending_response",
      "responded",
      "engaged",
      "converted",
      "declined",
      "deferred",
      "closed_lost",
    ];
    for (const s of allStates) {
      stateCounts[s] = 0;
    }

    const graph = getGraph();
    const graphContacts = (graph as { contacts?: Record<string, { enrichedName?: string; name?: string }> })?.contacts || {};

    const contacts: Array<{
      url: string;
      slug: string;
      name: string;
      state: string;
      createdAt: string;
      lastTransition: string;
    }> = [];

    for (const [url, contact] of Object.entries(state.contacts || {})) {
      const currentState = contact.currentState;
      stateCounts[currentState] = (stateCounts[currentState] || 0) + 1;

      const slug = extractSlug(url);
      const graphContact = graphContacts[url] as { enrichedName?: string; name?: string } | undefined;
      const name = graphContact?.enrichedName || graphContact?.name || slug;

      const lastHistory =
        contact.history && contact.history.length > 0
          ? contact.history[contact.history.length - 1]
          : null;

      contacts.push({
        url,
        slug,
        name,
        state: currentState,
        createdAt: contact.createdAt,
        lastTransition: lastHistory?.timestamp || contact.createdAt,
      });
    }

    // Sort by most recent transition
    contacts.sort(
      (a, b) =>
        new Date(b.lastTransition).getTime() -
        new Date(a.lastTransition).getTime()
    );

    const total = Object.keys(state.contacts || {}).length;

    // Funnel: cumulative stages
    const funnel = [
      { stage: "planned", count: stateCounts["planned"] || 0 },
      { stage: "sent", count: (stateCounts["sent"] || 0) + (stateCounts["pending_response"] || 0) },
      { stage: "responded", count: stateCounts["responded"] || 0 },
      { stage: "engaged", count: stateCounts["engaged"] || 0 },
      { stage: "converted", count: stateCounts["converted"] || 0 },
    ];

    return NextResponse.json({
      states: stateCounts,
      total,
      funnel,
      contacts,
      lastUpdated: state.lastUpdated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
