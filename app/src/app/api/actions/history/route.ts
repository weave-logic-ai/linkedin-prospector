import { NextResponse } from "next/server";
import { processManager } from "@/lib/process-manager";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const history = processManager.getHistory();
    return NextResponse.json({ processes: history });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
