// Phase 2 Track E — Target Sources panel.
//
// Lists source_records attached to the currently-locked target. Client
// component; fetches from /api/sources/target/[targetId]. When a row is
// clicked, expands to show the field-level breakdown returned by
// /api/sources/record/[id], including each field's composite `final_weight`.

"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";

interface TargetSourceRow {
  id: string;
  sourceType: string;
  canonicalUrl: string;
  title: string | null;
  fetchedAt: string;
  publishedAt: string | null;
  status: string;
}

interface FieldDetail {
  fieldName: string;
  fieldValue: unknown;
  subjectKind: string;
  subjectId: string;
  categoryDefaultSnapshot: number;
  perItemMultiplier: number;
  finalWeight: number;
  referencedDate: string | null;
}

interface RecordResponse {
  record: unknown;
  fields: FieldDetail[];
}

export interface TargetSourcesPanelProps {
  targetId: string;
  /** Controlled collapse state; parent can persist the toggle in storage. */
  defaultOpen?: boolean;
}

export function TargetSourcesPanel({
  targetId,
  defaultOpen = true,
}: TargetSourcesPanelProps) {
  const [open, setOpen] = useState<boolean>(defaultOpen);
  const [loading, setLoading] = useState<boolean>(false);
  const [rows, setRows] = useState<TargetSourceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, FieldDetail[] | "loading" | "error">>({});

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/sources/target/${targetId}`);
        if (!res.ok) {
          if (res.status === 404) {
            // Feature flag off — treat as empty.
            if (!cancelled) setRows([]);
            return;
          }
          throw new Error(`HTTP ${res.status}`);
        }
        const json = (await res.json()) as { rows: TargetSourceRow[] };
        if (!cancelled) setRows(json.rows);
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
  }, [targetId, open]);

  async function toggleExpand(recordId: string): Promise<void> {
    const curr = expanded[recordId];
    if (curr && curr !== "loading" && curr !== "error") {
      setExpanded({ ...expanded, [recordId]: undefined as unknown as FieldDetail[] });
      return;
    }
    setExpanded({ ...expanded, [recordId]: "loading" });
    try {
      const res = await fetch(`/api/sources/record/${recordId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as RecordResponse;
      setExpanded({ ...expanded, [recordId]: json.fields });
    } catch {
      setExpanded({ ...expanded, [recordId]: "error" });
    }
  }

  return (
    <Card>
      <CardHeader
        className="flex cursor-pointer flex-row items-center justify-between"
        onClick={() => setOpen((v) => !v)}
      >
        <CardTitle className="text-sm">Sources ({rows.length})</CardTitle>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </CardHeader>
      {open && (
        <CardContent>
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          )}
          {error && (
            <p className="text-sm text-destructive">Unable to load: {error}</p>
          )}
          {!loading && !error && rows.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No sources attached yet.
            </p>
          )}
          <div className="space-y-2">
            {rows.map((row) => {
              const detail = expanded[row.id];
              const isExpanded = Array.isArray(detail);
              return (
                <div key={row.id} className="rounded border p-2 text-xs">
                  <button
                    className="flex w-full items-center gap-2 text-left"
                    onClick={() => toggleExpand(row.id)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    <Badge variant="secondary" className="text-xs">
                      {row.sourceType}
                    </Badge>
                    <span className="flex-1 truncate" title={row.canonicalUrl}>
                      {row.title ?? row.canonicalUrl}
                    </span>
                    <span className="text-muted-foreground">
                      {new Date(row.fetchedAt).toLocaleDateString()}
                    </span>
                  </button>
                  {detail === "loading" && (
                    <div className="ml-5 mt-1 text-muted-foreground">
                      Loading fields...
                    </div>
                  )}
                  {detail === "error" && (
                    <div className="ml-5 mt-1 text-destructive">
                      Unable to load fields
                    </div>
                  )}
                  {isExpanded &&
                    (detail as FieldDetail[]).map((f) => (
                      <div
                        key={`${row.id}:${f.fieldName}`}
                        className="ml-5 mt-1 flex items-center justify-between gap-2 rounded bg-muted/50 px-2 py-1"
                      >
                        <span className="font-mono">{f.fieldName}</span>
                        <span className="text-muted-foreground">
                          {f.categoryDefaultSnapshot.toFixed(2)} ×{" "}
                          {f.perItemMultiplier.toFixed(2)} ={" "}
                          <strong>{f.finalWeight.toFixed(3)}</strong>
                        </span>
                      </div>
                    ))}
                </div>
              );
            })}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
