import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const PROJECT_ROOT = resolve(process.cwd(), "../../../");
const DATA_DIR = resolve(PROJECT_ROOT, ".linkedin-prospector/data");
const NOTES_PATH = resolve(DATA_DIR, "contact-notes.json");

interface NoteEntry {
  text: string;
  timestamp: string;
  state: string | null;
}

function getAllNotes(): Record<string, NoteEntry[] | string> {
  if (!existsSync(NOTES_PATH)) return {};
  return JSON.parse(readFileSync(NOTES_PATH, "utf-8"));
}

function getNotesForSlug(slug: string): NoteEntry[] {
  const all = getAllNotes();
  const raw = all[slug];
  if (!raw) return [];
  // Backwards compat: migrate old string format
  if (typeof raw === "string") {
    return raw ? [{ text: raw, timestamp: new Date().toISOString(), state: null }] : [];
  }
  return raw as NoteEntry[];
}

function saveAllNotes(notes: Record<string, NoteEntry[]>): void {
  writeFileSync(NOTES_PATH, JSON.stringify(notes, null, 2));
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  return NextResponse.json({ notes: getNotesForSlug(slug) });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const body = await request.json();
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const all = getAllNotes() as Record<string, NoteEntry[]>;
  // Migrate old format if needed
  if (typeof all[slug] === "string") {
    const old = all[slug] as unknown as string;
    all[slug] = old ? [{ text: old, timestamp: new Date().toISOString(), state: null }] : [];
  }
  if (!all[slug]) all[slug] = [];

  const entry: NoteEntry = {
    text,
    timestamp: new Date().toISOString(),
    state: body.state || null,
  };
  (all[slug] as NoteEntry[]).push(entry);
  saveAllNotes(all as Record<string, NoteEntry[]>);

  return NextResponse.json({ ok: true, notes: all[slug] });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const body = await request.json();
  const index = typeof body.index === "number" ? body.index : -1;

  const all = getAllNotes() as Record<string, NoteEntry[]>;
  if (typeof all[slug] === "string") {
    all[slug] = [];
  }
  const notes = (all[slug] || []) as NoteEntry[];

  if (index < 0 || index >= notes.length) {
    return NextResponse.json({ error: "Invalid index" }, { status: 400 });
  }

  notes.splice(index, 1);
  all[slug] = notes;
  saveAllNotes(all as Record<string, NoteEntry[]>);

  return NextResponse.json({ ok: true, notes });
}
