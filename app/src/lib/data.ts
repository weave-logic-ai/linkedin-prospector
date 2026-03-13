/**
 * Path resolution and JSON file I/O for the LinkedIn Prospector data layer.
 *
 * IMPORTANT: The app lives at .claude/linkedin-prospector/app/ but the data
 * files live at .linkedin-prospector/data/ — these are different directory
 * trees. We resolve paths relative to the ctox project root.
 *
 * process.env.PROSPECTOR_DATA_DIR MUST be set before importing rvf-store.mjs,
 * because lib.mjs in the scripts directory defaults to the skill's own data/
 * folder (which is the config dir, not the runtime data dir).
 */

import { resolve } from "path";
import { readFile, writeFile, stat } from "fs/promises";
import { existsSync } from "fs";

// ---------------------------------------------------------------------------
// Path constants
// ---------------------------------------------------------------------------

/**
 * The ctox project root. The app is at:
 *   <PROJECT_ROOT>/.claude/linkedin-prospector/app/
 * so process.cwd() should be the app dir and we go up 3 levels.
 *
 * In Next.js, process.cwd() returns the project root of the Next.js app,
 * which is the `app/` directory.
 */
const PROJECT_ROOT = resolve(process.cwd(), "../../..");

/** Runtime data directory — contacts, graph, outreach, rate-budget */
export const DATA_DIR = resolve(PROJECT_ROOT, ".linkedin-prospector/data");

/** Scripts directory — contains rvf-store.mjs and other pipeline scripts */
export const SCRIPTS_DIR = resolve(
  PROJECT_ROOT,
  ".claude/linkedin-prospector/skills/linkedin-prospector/scripts"
);

/** Skill config directory — icp-config.json, behavioral-config.json, etc. */
export const CONFIG_DIR = resolve(
  PROJECT_ROOT,
  ".claude/linkedin-prospector/skills/linkedin-prospector/data"
);

// Set the environment variable so rvf-store.mjs resolves DATA_DIR correctly.
// This MUST happen before any dynamic import of rvf-store.mjs.
process.env.PROSPECTOR_DATA_DIR = DATA_DIR;

// ---------------------------------------------------------------------------
// Well-known file paths
// ---------------------------------------------------------------------------

export const GRAPH_JSON_PATH = resolve(DATA_DIR, "graph.json");
export const CONTACTS_JSON_PATH = resolve(DATA_DIR, "contacts.json");
export const OUTREACH_STATE_PATH = resolve(DATA_DIR, "outreach-state.json");
export const OUTREACH_PLAN_PATH = resolve(DATA_DIR, "outreach-plan.json");
export const RATE_BUDGET_PATH = resolve(CONFIG_DIR, "rate-budget.json");
export const RVF_STORE_PATH = resolve(DATA_DIR, "network.rvf");

export const ICP_CONFIG_PATH = resolve(CONFIG_DIR, "icp-config.json");
export const BEHAVIORAL_CONFIG_PATH = resolve(CONFIG_DIR, "behavioral-config.json");
export const OUTREACH_CONFIG_PATH = resolve(CONFIG_DIR, "outreach-config.json");
export const REFERRAL_CONFIG_PATH = resolve(CONFIG_DIR, "referral-config.json");

// ---------------------------------------------------------------------------
// JSON file I/O
// ---------------------------------------------------------------------------

/**
 * Read and parse a JSON file from the DATA_DIR.
 * Returns null if the file does not exist or cannot be parsed.
 */
export async function readJsonFile<T = unknown>(filename: string): Promise<T | null> {
  const filepath = resolve(DATA_DIR, filename);
  return readJsonPath<T>(filepath);
}

/**
 * Read and parse a JSON file from an absolute path.
 * Returns null if the file does not exist or cannot be parsed.
 */
export async function readJsonPath<T = unknown>(filepath: string): Promise<T | null> {
  try {
    const raw = await readFile(filepath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Write an object as JSON to a file in the DATA_DIR.
 */
export async function writeJsonFile(filename: string, data: unknown): Promise<void> {
  const filepath = resolve(DATA_DIR, filename);
  await writeFile(filepath, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Write an object as JSON to an absolute path.
 */
export async function writeJsonPath(filepath: string, data: unknown): Promise<void> {
  await writeFile(filepath, JSON.stringify(data, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// File metadata
// ---------------------------------------------------------------------------

/**
 * Get the modification time of a file in DATA_DIR.
 * Returns null if the file does not exist.
 */
export async function getFileMtime(filename: string): Promise<Date | null> {
  const filepath = resolve(DATA_DIR, filename);
  return getPathMtime(filepath);
}

/**
 * Get the modification time of an absolute file path.
 * Returns null if the file does not exist.
 */
export async function getPathMtime(filepath: string): Promise<Date | null> {
  try {
    const s = await stat(filepath);
    return s.mtime;
  } catch {
    return null;
  }
}

/**
 * Check if a file exists in the DATA_DIR.
 */
export function dataFileExists(filename: string): boolean {
  return existsSync(resolve(DATA_DIR, filename));
}

/**
 * Check if a file exists at an absolute path.
 */
export function fileExists(filepath: string): boolean {
  return existsSync(filepath);
}
