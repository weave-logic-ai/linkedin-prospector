import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const PROJECT_ROOT = resolve(process.cwd(), "../../../");
const DATA_DIR = resolve(PROJECT_ROOT, ".linkedin-prospector/data");

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const budgetPath = resolve(DATA_DIR, "../../../.claude/linkedin-prospector/skills/linkedin-prospector/data/rate-budget.json");

    if (!existsSync(budgetPath)) {
      return NextResponse.json({
        date: new Date().toISOString().slice(0, 10),
        operations: {},
        history: [],
      });
    }

    const raw = readFileSync(budgetPath, "utf-8");
    const budget = JSON.parse(raw);

    return NextResponse.json(budget);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
