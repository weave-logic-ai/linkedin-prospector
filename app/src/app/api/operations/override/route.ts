import { NextResponse } from "next/server";
import { getLinkedInOverrideStatus, setLinkedInOverride } from "@/lib/process-manager";

export async function GET() {
  try {
    const state = getLinkedInOverrideStatus();
    return NextResponse.json(state);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { enabled, reason } = body as { enabled: boolean; reason?: string };

    if (typeof enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
    }

    const state = setLinkedInOverride(enabled, reason);
    return NextResponse.json(state);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
