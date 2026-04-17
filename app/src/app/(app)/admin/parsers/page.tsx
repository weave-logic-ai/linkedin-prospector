// /admin/parsers — WS-1 acceptance §3.1 admin surface.
//
// Read-only yield table sourced from `parse_field_outcomes_daily` (with raw
// fallback). One card per parser, with a bar per field showing yield.
// When RESEARCH_PARSER_TELEMETRY is disabled the page renders a banner and
// explains how to turn it on.

"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, Database } from "lucide-react";

interface YieldRow {
  pageType: string;
  fieldName: string;
  nSamples: number;
  nPresent: number;
  yield: number;
  avgConfidence: number | null;
}

interface YieldResponse {
  flagEnabled: boolean;
  windowDays: number;
  rows: YieldRow[];
  message?: string;
}

const PARSER_TYPES = [
  "PROFILE",
  "COMPANY",
  "SEARCH_PEOPLE",
  "SEARCH_CONTENT",
  "FEED",
  "CONNECTIONS",
  "MESSAGES",
];

function yieldColour(y: number): string {
  if (y >= 0.8) return "bg-emerald-500";
  if (y >= 0.4) return "bg-amber-500";
  return "bg-red-500";
}

function formatPct(y: number): string {
  return `${Math.round(y * 100)}%`;
}

export default function AdminParsersPage() {
  const [data, setData] = useState<YieldResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState<number>(7);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/parser/yield-report?windowDays=${windowDays}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as YieldResponse;
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [windowDays]);

  // Group rows by pageType for card rendering.
  const rowsByType: Record<string, YieldRow[]> = {};
  for (const row of data?.rows ?? []) {
    (rowsByType[row.pageType] ??= []).push(row);
  }
  for (const list of Object.values(rowsByType)) {
    list.sort((a, b) => a.fieldName.localeCompare(b.fieldName));
  }

  return (
    <div>
      <PageHeader
        title="Parser yield"
        description={`Field extraction yield by parser, last ${windowDays} days.`}
      />

      <div className="mb-4 flex items-center gap-3">
        <label className="text-sm text-muted-foreground">Window:</label>
        <select
          className="rounded border bg-background px-2 py-1 text-sm"
          value={windowDays}
          onChange={(e) => setWindowDays(Number(e.target.value))}
        >
          {[1, 7, 14, 30, 90].map((d) => (
            <option key={d} value={d}>
              {d} days
            </option>
          ))}
        </select>
      </div>

      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center p-10">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            <span className="text-muted-foreground">Loading yield report...</span>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card>
          <CardContent className="flex items-start gap-3 p-6">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div>
              <p className="font-medium">Yield report unavailable</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && !error && data && !data.flagEnabled && (
        <Card className="border-amber-300/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" /> Telemetry disabled
            </CardTitle>
            <CardDescription>
              RESEARCH_PARSER_TELEMETRY is off. Enable it in the server
              environment to populate this view. No rows are being written to
              parse_field_outcomes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">
              {`# docker-compose.yml\nenvironment:\n  RESEARCH_PARSER_TELEMETRY: "true"\n`}
            </pre>
            <p className="mt-3 text-xs text-muted-foreground">
              See ADR-031 for retention details (90-day raw plus daily aggregate).
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && !error && data?.flagEnabled && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {PARSER_TYPES.map((pt) => {
            const rows = rowsByType[pt] ?? [];
            return (
              <Card key={pt}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{pt}</span>
                    <Badge variant="secondary">{rows.length} fields</Badge>
                  </CardTitle>
                  <CardDescription>
                    {rows.length === 0
                      ? "No samples in window."
                      : `Rows aggregated from ${rows.reduce((a, r) => a + r.nSamples, 0)} parse events.`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {rows.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Waiting for the first parse to populate this parser.
                    </p>
                  )}
                  {rows.map((row) => (
                    <div key={row.fieldName} className="space-y-1">
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="font-mono">{row.fieldName}</span>
                        <span className="text-muted-foreground">
                          {formatPct(row.yield)} · {row.nPresent}/{row.nSamples} · conf{" "}
                          {row.avgConfidence != null ? row.avgConfidence.toFixed(2) : "—"}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded bg-muted">
                        <div
                          className={`h-full ${yieldColour(row.yield)}`}
                          style={{ width: `${Math.round(row.yield * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
