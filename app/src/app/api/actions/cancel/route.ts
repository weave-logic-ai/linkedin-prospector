import { NextResponse } from "next/server";
import { processManager } from "@/lib/process-manager";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { processId } = body as { processId: string };

    if (!processId) {
      return NextResponse.json(
        { error: "processId is required" },
        { status: 400 }
      );
    }

    const cancelled = processManager.cancel(processId);

    if (!cancelled) {
      return NextResponse.json(
        { error: "Process not found or already finished" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, processId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
