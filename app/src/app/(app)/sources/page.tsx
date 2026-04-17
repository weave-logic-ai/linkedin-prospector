// /sources — Phase 2 Track E admin page (WS-5).
//
// Lists source_records for the current tenant, paginated. Filterable by
// source_type. Surfaces the two trust weights (category_default × per_item
// multiplier = final_weight) and, for Wayback-of-LinkedIn rows, whether the
// reparse landed in page_cache.

"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface SourceRow {
  id: string;
  sourceType: string;
  canonicalUrl: string;
  title: string | null;
  fetchedAt: string;
  publishedAt: string | null;
  contentBytes: number;
  status: string;
  perItemMultiplier: number;
  reparseStored: boolean;
  capturedAt: string | null;
}

interface ListResponse {
  rows: SourceRow[];
  limit: number;
  offset: number;
}

const SOURCE_TYPES = [
  { value: "", label: "All" },
  { value: "wayback", label: "Wayback" },
  { value: "edgar", label: "EDGAR" },
  { value: "rss", label: "RSS" },
  { value: "news", label: "News" },
  { value: "blog", label: "Blog" },
  { value: "podcast", label: "Podcast" },
];

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export default function SourcesPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<string>("");
  const [offset, setOffset] = useState<number>(0);
  const limit = 50;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({
          limit: String(limit),
          offset: String(offset),
        });
        if (sourceType) qs.set("sourceType", sourceType);
        const res = await fetch(`/api/sources/list?${qs.toString()}`);
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error(
              "Sources feature is disabled — set RESEARCH_SOURCES=true"
            );
          }
          throw new Error(`HTTP ${res.status}`);
        }
        const json = (await res.json()) as ListResponse;
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
  }, [sourceType, offset]);

  const rows = useMemo(() => data?.rows ?? [], [data]);

  return (
    <div>
      <PageHeader
        title="Sources"
        description="Ingested documents across Wayback, EDGAR, and other connectors."
      />

      <div className="mb-4 flex items-center gap-3">
        <label className="text-sm text-muted-foreground">Filter:</label>
        <select
          className="rounded border bg-background px-2 py-1 text-sm"
          value={sourceType}
          onChange={(e) => {
            setOffset(0);
            setSourceType(e.target.value);
          }}
        >
          {SOURCE_TYPES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center p-10">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            <span className="text-muted-foreground">Loading sources...</span>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card>
          <CardContent className="p-6">
            <p className="font-medium">Unable to load sources</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      )}

      {!loading && !error && (
        <Card>
          <CardHeader>
            <CardTitle>Recent ingestions</CardTitle>
            <CardDescription>
              Ordered by fetched_at DESC. {rows.length} row
              {rows.length === 1 ? "" : "s"}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {rows.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No source records yet. Trigger the Wayback cron or add a
                company CIK to kick off EDGAR backfill.
              </p>
            )}
            <div className="space-y-2">
              {rows.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-col gap-1 rounded border p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="secondary">{row.sourceType}</Badge>
                    <span className="text-xs text-muted-foreground">
                      fetched {new Date(row.fetchedAt).toLocaleString()}
                    </span>
                  </div>
                  <a
                    href={row.canonicalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate font-mono text-xs hover:underline"
                    title={row.canonicalUrl}
                  >
                    {row.canonicalUrl}
                  </a>
                  {row.title && (
                    <p className="text-sm font-medium">{row.title}</p>
                  )}
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>{formatBytes(row.contentBytes)}</span>
                    <span>status: {row.status}</span>
                    <span>
                      per-item multiplier: {row.perItemMultiplier.toFixed(2)}
                    </span>
                    {row.capturedAt && (
                      <span>
                        captured {new Date(row.capturedAt).toLocaleDateString()}
                      </span>
                    )}
                    {row.reparseStored && (
                      <Badge variant="outline" className="text-xs">
                        LinkedIn reparse
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <button
                className="rounded border px-3 py-1 text-sm disabled:opacity-50"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
              >
                Prev
              </button>
              <span className="text-xs text-muted-foreground">
                Page {Math.floor(offset / limit) + 1}
              </span>
              <button
                className="rounded border px-3 py-1 text-sm disabled:opacity-50"
                disabled={rows.length < limit}
                onClick={() => setOffset(offset + limit)}
              >
                Next
              </button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
