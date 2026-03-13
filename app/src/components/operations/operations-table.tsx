"use client";

import { useState, Fragment } from "react";
import useSWR from "swr";
import { ChevronDown, ChevronRight, Monitor, Globe, Loader2 } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface OpsLogEntry {
  id: string;
  script: string;
  args: string[];
  isPlaywright: boolean;
  startedAt: string;
  completedAt?: string;
  status: string;
  exitCode?: number | null;
  duration?: number | null;
  outputSummary?: string;
  blockedReason?: string;
}

interface LogResponse {
  entries: OpsLogEntry[];
  total: number;
  hasMore: boolean;
}

const statusColors: Record<string, string> = {
  completed: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  failed: "bg-red-500/15 text-red-500 border-red-500/30",
  blocked: "bg-orange-500/15 text-orange-500 border-orange-500/30",
  running: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  cancelled: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  queued: "bg-violet-500/15 text-violet-400 border-violet-500/30",
};

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return "-";
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return `${mins}m ${remSecs}s`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function OperationsTable() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [playwrightFilter, setPlaywrightFilter] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);

  const params = new URLSearchParams();
  if (statusFilter) params.set("status", statusFilter);
  if (playwrightFilter) params.set("playwright", playwrightFilter);
  params.set("limit", String(limit));
  params.set("offset", String(offset));

  const { data, isLoading } = useSWR<LogResponse>(
    `/api/operations/log?${params.toString()}`,
    fetcher,
    { refreshInterval: 5000 }
  );

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const hasMore = data?.hasMore ?? false;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Operations Log</CardTitle>
          <div className="text-xs text-muted-foreground">{total} entries</div>
        </div>
        <div className="flex gap-2 pt-2">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setOffset(0); }}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All statuses</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="blocked">Blocked</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            value={playwrightFilter}
            onChange={(e) => { setPlaywrightFilter(e.target.value); setOffset(0); }}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All types</option>
            <option value="true">Playwright (browser)</option>
            <option value="false">Local scripts</option>
          </select>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading && entries.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No operations recorded yet
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Script</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Args</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <Fragment key={entry.id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                    >
                      <TableCell className="w-8 pr-0">
                        {expandedId === entry.id ? (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatTime(entry.startedAt)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {entry.script}
                      </TableCell>
                      <TableCell>
                        {entry.isPlaywright ? (
                          <Badge variant="outline" className="text-[10px] gap-1">
                            <Globe className="h-2.5 w-2.5" /> browser
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] gap-1">
                            <Monitor className="h-2.5 w-2.5" /> local
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${statusColors[entry.status] || ""}`}
                        >
                          {entry.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDuration(entry.duration)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {entry.args.length > 0 ? entry.args.join(" ") : "-"}
                      </TableCell>
                    </TableRow>
                    {expandedId === entry.id && (
                      <TableRow>
                        <TableCell colSpan={7} className="bg-muted/30">
                          <div className="space-y-1 py-1">
                            <div className="text-xs">
                              <span className="text-muted-foreground">ID: </span>
                              <span className="font-mono">{entry.id}</span>
                            </div>
                            {entry.blockedReason && (
                              <div className="text-xs">
                                <span className="text-muted-foreground">Blocked: </span>
                                <span className="text-orange-500">{entry.blockedReason}</span>
                              </div>
                            )}
                            {entry.exitCode !== undefined && entry.exitCode !== null && (
                              <div className="text-xs">
                                <span className="text-muted-foreground">Exit code: </span>
                                <span>{entry.exitCode}</span>
                              </div>
                            )}
                            {entry.outputSummary && (
                              <div className="mt-2">
                                <div className="text-[10px] text-muted-foreground mb-1">Output (last lines):</div>
                                <pre className="rounded bg-muted p-2 text-[11px] max-h-40 overflow-auto whitespace-pre-wrap font-mono">
                                  {entry.outputSummary.slice(-2000)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
            {(hasMore || offset > 0) && (
              <div className="flex items-center justify-between border-t px-4 py-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                >
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">
                  {offset + 1}-{Math.min(offset + limit, total)} of {total}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!hasMore}
                  onClick={() => setOffset(offset + limit)}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
