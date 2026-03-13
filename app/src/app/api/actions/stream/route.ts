import { processManager } from "@/lib/process-manager";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const processId = searchParams.get("processId");

  if (!processId) {
    return new Response("Missing processId", { status: 400 });
  }

  const record = processManager.getProcess(processId);
  if (!record) {
    return new Response("Process not found", { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
            )
          );
        } catch {
          // Controller may be closed
        }
      };

      // Send existing output first
      if (record.output && record.output.length > 0) {
        for (const line of record.output) {
          if (line.startsWith("[stderr] ")) {
            send("stderr", line.slice(9));
          } else {
            send("stdout", line);
          }
        }
      }

      // If already finished, send exit immediately
      if (
        record.status === "completed" ||
        record.status === "failed" ||
        record.status === "cancelled"
      ) {
        send("exit", {
          code: record.exitCode,
          status: record.status,
          duration: record.duration,
        });
        controller.close();
        return;
      }

      // Listen for new events
      const removeListener = processManager.addListener_sse(
        processId,
        (event: string, data: unknown) => {
          send(event, data);
          if (event === "exit" || event === "error") {
            setTimeout(() => {
              try {
                controller.close();
              } catch {
                // Already closed
              }
            }, 100);
          }
        }
      );

      // Keepalive every 15 seconds
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepalive);
        }
      }, 15000);

      // Clean up on abort
      request.signal.addEventListener("abort", () => {
        removeListener();
        clearInterval(keepalive);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
