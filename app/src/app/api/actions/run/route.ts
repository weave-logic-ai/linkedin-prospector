import { NextResponse } from "next/server";
import { processManager } from "@/lib/process-manager";
import { getScriptById } from "@/lib/script-definitions";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { scriptId, params } = body as {
      scriptId: string;
      params?: Record<string, string | number | boolean>;
    };

    if (!scriptId) {
      return NextResponse.json(
        { error: "scriptId is required" },
        { status: 400 }
      );
    }

    const script = getScriptById(scriptId);
    if (!script) {
      return NextResponse.json(
        { error: `Unknown script: ${scriptId}` },
        { status: 400 }
      );
    }

    // Validate required params
    for (const param of script.params) {
      if (param.required && (!params || !params[param.name])) {
        return NextResponse.json(
          { error: `Missing required parameter: ${param.label}` },
          { status: 400 }
        );
      }
    }

    // Build args from params
    const args: string[] = [];
    if (params) {
      for (const param of script.params) {
        const value = params[param.name];
        if (value !== undefined && value !== null && value !== "") {
          if (param.type === "select" && String(value).startsWith("--")) {
            // Flags like --rescore
            args.push(String(value));
          } else if (param.type === "boolean") {
            if (value) args.push(`--${param.name}`);
          } else {
            args.push(`--${param.name}`, String(value));
          }
        }
      }
    }

    // Special case for GDPR forget
    if (scriptId === "forget") {
      args.unshift("--forget");
    }

    const result = processManager.run(script.script, args);

    if (result.status === "blocked") {
      return NextResponse.json(
        {
          processId: result.id,
          status: "blocked",
          reason: result.reason,
          script: script.name,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      processId: result.id,
      status: result.status,
      script: script.name,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
