import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const PROJECT_ROOT = resolve(process.cwd(), "../../../");
const DATA_DIR = resolve(PROJECT_ROOT, ".linkedin-prospector/data");
const STATE_PATH = resolve(DATA_DIR, "outreach-state.json");

const VALID_STATES = [
  "planned", "sent", "pending_response", "responded",
  "engaged", "converted", "declined", "deferred", "closed_lost",
];

const TRANSITIONS: Record<string, string[]> = {
  planned: ["sent", "deferred"],
  sent: ["pending_response"],
  pending_response: ["responded", "declined", "deferred"],
  responded: ["engaged", "declined"],
  engaged: ["converted", "declined"],
  converted: [],
  declined: ["closed_lost", "deferred"],
  deferred: ["planned"],
  closed_lost: [],
};

function getState(): { contacts: Record<string, any>; version: string; lastUpdated: string } {
  if (!existsSync(STATE_PATH)) {
    return { contacts: {}, version: "1.0", lastUpdated: new Date().toISOString() };
  }
  return JSON.parse(readFileSync(STATE_PATH, "utf-8"));
}

function saveState(state: any): void {
  state.lastUpdated = new Date().toISOString();
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const state = getState();
  const url = `https://www.linkedin.com/in/${slug}`;
  const contact = state.contacts[url] || state.contacts[url + "/"] || null;
  const validTransitions = contact ? (TRANSITIONS[contact.currentState] || []) : VALID_STATES.slice(0, 1);
  return NextResponse.json({
    state: contact?.currentState || null,
    history: contact?.history || [],
    validTransitions,
    createdAt: contact?.createdAt || null,
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const body = await request.json();
  const newState = body.state;

  if (!VALID_STATES.includes(newState)) {
    return NextResponse.json({ error: "Invalid state" }, { status: 400 });
  }

  const stateFile = getState();
  const url = `https://www.linkedin.com/in/${slug}`;

  // Find existing contact entry (with or without trailing slash)
  let existingKey = null;
  if (stateFile.contacts[url]) existingKey = url;
  else if (stateFile.contacts[url + "/"]) existingKey = url + "/";

  const contact = existingKey ? stateFile.contacts[existingKey] : null;
  const currentState = contact?.currentState || null;

  // Validate transition (if contact already has a state)
  if (currentState) {
    const allowed = TRANSITIONS[currentState] || [];
    if (!allowed.includes(newState)) {
      return NextResponse.json(
        { error: `Cannot transition from ${currentState} to ${newState}. Allowed: ${allowed.join(", ")}` },
        { status: 400 }
      );
    }
  }

  const key = existingKey || url;
  if (!stateFile.contacts[key]) {
    stateFile.contacts[key] = {
      currentState: newState,
      history: [],
      createdAt: new Date().toISOString(),
    };
  }

  if (currentState) {
    stateFile.contacts[key].history.push({
      from: currentState,
      to: newState,
      timestamp: new Date().toISOString(),
      note: body.note || null,
    });
  }
  stateFile.contacts[key].currentState = newState;

  saveState(stateFile);

  return NextResponse.json({
    ok: true,
    state: newState,
    validTransitions: TRANSITIONS[newState] || [],
    history: stateFile.contacts[key].history,
  });
}
