"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TerminalOutputProps {
  processId: string;
  scriptName: string;
  onClose: () => void;
  onProcessEnd: (processId: string) => void;
}

interface OutputLine {
  type: "stdout" | "stderr" | "system";
  text: string;
  timestamp: number;
}

export function TerminalOutput({
  processId,
  scriptName,
  onClose,
  onProcessEnd,
}: TerminalOutputProps) {
  const [lines, setLines] = React.useState<OutputLine[]>([]);
  const [status, setStatus] = React.useState<
    "connecting" | "running" | "completed" | "failed" | "cancelled"
  >("connecting");
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const eventSourceRef = React.useRef<EventSource | null>(null);

  React.useEffect(() => {
    const es = new EventSource(`/api/actions/stream?processId=${processId}`);
    eventSourceRef.current = es;

    es.onopen = () => {
      setStatus("running");
    };

    es.addEventListener("stdout", (e) => {
      const text = JSON.parse(e.data) as string;
      setLines((prev) => [
        ...prev,
        { type: "stdout", text, timestamp: Date.now() },
      ]);
    });

    es.addEventListener("stderr", (e) => {
      const text = JSON.parse(e.data) as string;
      setLines((prev) => [
        ...prev,
        { type: "stderr", text, timestamp: Date.now() },
      ]);
    });

    es.addEventListener("exit", (e) => {
      const data = JSON.parse(e.data) as {
        code: number | null;
        status: string;
        duration?: number;
      };
      const finalStatus =
        data.status === "completed"
          ? "completed"
          : data.status === "cancelled"
            ? "cancelled"
            : "failed";
      setStatus(finalStatus);

      const durationStr = data.duration
        ? `${(data.duration / 1000).toFixed(1)}s`
        : "";
      setLines((prev) => [
        ...prev,
        {
          type: "system",
          text: `\n--- Process ${finalStatus} (exit code: ${data.code ?? "N/A"}) ${durationStr} ---`,
          timestamp: Date.now(),
        },
      ]);

      onProcessEnd(processId);
      es.close();
    });

    es.addEventListener("error", () => {
      // EventSource reconnects automatically, but if the stream ended
      // this may fire. Only update status if still connecting.
      if (status === "connecting") {
        setStatus("failed");
      }
    });

    return () => {
      es.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processId]);

  // Auto-scroll
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  const handleCancel = async () => {
    try {
      await fetch("/api/actions/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processId }),
      });
    } catch {
      // Ignore errors
    }
  };

  return (
    <Card className="border-primary/30">
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm">{scriptName}</CardTitle>
            <Badge
              variant={
                status === "running"
                  ? "default"
                  : status === "completed"
                    ? "secondary"
                    : "destructive"
              }
              className="text-[10px]"
            >
              {status}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {status === "running" && (
              <Button
                size="sm"
                variant="destructive"
                onClick={handleCancel}
                className="h-7 text-xs"
              >
                Cancel
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              className="h-7 text-xs"
            >
              Close
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div
          ref={scrollRef}
          className="h-[300px] overflow-auto rounded-md bg-[#0d1117] p-3 font-mono text-xs leading-relaxed"
        >
          {lines.length === 0 && status === "connecting" && (
            <span className="text-muted-foreground">Connecting...</span>
          )}
          {lines.map((line, i) => (
            <div
              key={i}
              className={cn(
                "whitespace-pre-wrap break-all",
                line.type === "stderr" && "text-amber-400",
                line.type === "stdout" && "text-gray-300",
                line.type === "system" && "text-blue-400 font-semibold"
              )}
            >
              {line.text}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
