"use client";

import * as React from "react";
import useSWR from "swr";
import {
  scriptDefinitions,
  categoryLabels,
  categoryOrder,
  getScriptsByCategory,
  type ScriptDefinition,
} from "@/lib/script-definitions";
import { ActionRow } from "@/components/actions/action-row";
import { TerminalOutput } from "@/components/actions/terminal-output";
import { BudgetSidebar } from "@/components/actions/budget-sidebar";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ActiveProcess {
  id: string;
  script: string;
  status: string;
  startedAt: string;
}

export function ActionsContent() {
  const [activeProcessId, setActiveProcessId] = React.useState<string | null>(
    null
  );
  const [activeScriptName, setActiveScriptName] = React.useState<string>("");
  const [runningScripts, setRunningScripts] = React.useState<
    Map<string, string>
  >(new Map());

  const { data: activeData } = useSWR<{ processes: ActiveProcess[] }>(
    "/api/actions/active",
    fetcher,
    { refreshInterval: 5000 }
  );

  const { data: historyData } = useSWR<{ processes: ActiveProcess[] }>(
    "/api/actions/history",
    fetcher,
    { refreshInterval: 10000 }
  );

  const handleRun = async (
    scriptId: string,
    scriptName: string,
    params: Record<string, string | number | boolean>
  ) => {
    try {
      const res = await fetch("/api/actions/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptId, params }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to start action");
        return;
      }

      setRunningScripts((prev) => {
        const next = new Map(prev);
        next.set(scriptId, data.processId);
        return next;
      });

      setActiveProcessId(data.processId);
      setActiveScriptName(scriptName);
    } catch (err) {
      alert(
        `Failed to start action: ${err instanceof Error ? err.message : "unknown error"}`
      );
    }
  };

  const handleProcessEnd = (processId: string) => {
    setRunningScripts((prev) => {
      const next = new Map(prev);
      for (const [key, val] of next) {
        if (val === processId) {
          next.delete(key);
          break;
        }
      }
      return next;
    });
  };

  const [expandedCategories, setExpandedCategories] = React.useState<
    Set<string>
  >(new Set(categoryOrder));

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Actions</h1>
        <p className="text-muted-foreground text-sm">
          Run prospecting scripts and manage pipeline operations
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
        {/* Left column: Script list */}
        <div className="space-y-4">
          {categoryOrder.map((cat) => {
            const scripts = getScriptsByCategory(cat);
            const isExpanded = expandedCategories.has(cat);

            return (
              <Card key={cat}>
                <CardHeader
                  className="cursor-pointer select-none"
                  onClick={() => toggleCategory(cat)}
                >
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">
                      {categoryLabels[cat]}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">
                        {scripts.length}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        {isExpanded ? "v" : ">"}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                {isExpanded && (
                  <CardContent className="space-y-2 pt-0">
                    {scripts.map((script) => (
                      <ActionRow
                        key={script.id}
                        script={script}
                        isRunning={runningScripts.has(script.id)}
                        onRun={(params) =>
                          handleRun(script.id, script.name, params)
                        }
                      />
                    ))}
                  </CardContent>
                )}
              </Card>
            );
          })}

          {/* Terminal Output */}
          {activeProcessId && (
            <TerminalOutput
              processId={activeProcessId}
              scriptName={activeScriptName}
              onClose={() => setActiveProcessId(null)}
              onProcessEnd={handleProcessEnd}
            />
          )}

          {/* Recent history */}
          {historyData?.processes && historyData.processes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Recent Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {historyData.processes.slice(0, 10).map((proc) => (
                    <div
                      key={proc.id}
                      className="flex items-center justify-between text-xs py-1"
                    >
                      <span className="font-mono text-muted-foreground">
                        {proc.script}
                      </span>
                      <Badge
                        variant={
                          proc.status === "completed"
                            ? "default"
                            : proc.status === "failed"
                              ? "destructive"
                              : "secondary"
                        }
                        className="text-[10px]"
                      >
                        {proc.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column: Budget sidebar */}
        <div>
          <BudgetSidebar />

          {/* Active processes */}
          {activeData?.processes && activeData.processes.length > 0 && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-sm">Active Processes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {activeData.processes.map((proc) => (
                    <div
                      key={proc.id}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="font-mono truncate mr-2">
                        {proc.script}
                      </span>
                      <Badge
                        variant={
                          proc.status === "running" ? "default" : "secondary"
                        }
                        className="text-[10px] shrink-0"
                      >
                        {proc.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
