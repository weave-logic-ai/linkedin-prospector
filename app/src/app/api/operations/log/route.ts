import { NextResponse } from "next/server";
import { readOperationsLog } from "@/lib/process-manager";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;
    const playwrightParam = searchParams.get("playwright");
    const playwright = playwrightParam === "true" ? true : playwrightParam === "false" ? false : undefined;
    const limit = parseInt(searchParams.get("limit") || "100");
    const offset = parseInt(searchParams.get("offset") || "0");

    const result = readOperationsLog({ status, playwright, limit, offset });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
