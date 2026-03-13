import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "fs";
import { resolve } from "path";

const PROJECT_ROOT = resolve(process.cwd(), "../../../");
const CONFIG_DIR = resolve(
  PROJECT_ROOT,
  ".claude/linkedin-prospector/skills/linkedin-prospector/data"
);

const ALLOWED_FILES = new Set([
  "icp-config.json",
  "behavioral-config.json",
  "outreach-config.json",
  "referral-config.json",
]);

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;

    if (!ALLOWED_FILES.has(filename)) {
      return NextResponse.json(
        { error: `File not allowed: ${filename}` },
        { status: 400 }
      );
    }

    const filePath = resolve(CONFIG_DIR, filename);

    if (!existsSync(filePath)) {
      return NextResponse.json(
        { error: `Config file not found: ${filename}` },
        { status: 404 }
      );
    }

    const raw = readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);

    return NextResponse.json({ filename, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;

    if (!ALLOWED_FILES.has(filename)) {
      return NextResponse.json(
        { error: `File not allowed: ${filename}` },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { data } = body as { data: unknown };

    if (data === undefined || data === null) {
      return NextResponse.json(
        { error: "Missing data in request body" },
        { status: 400 }
      );
    }

    // Validate JSON is well-formed
    const serialized = JSON.stringify(data, null, 2);

    const filePath = resolve(CONFIG_DIR, filename);

    // Create backup before writing
    if (existsSync(filePath)) {
      const backupName = `${filename}.backup-${Date.now()}`;
      const backupPath = resolve(CONFIG_DIR, backupName);
      copyFileSync(filePath, backupPath);
    }

    writeFileSync(filePath, serialized + "\n", "utf-8");

    return NextResponse.json({
      success: true,
      filename,
      savedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
