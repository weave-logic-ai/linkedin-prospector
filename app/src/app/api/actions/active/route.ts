import { NextResponse } from "next/server";
import { processManager } from "@/lib/process-manager";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const active = processManager.getActive();
    return NextResponse.json({ processes: active });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
