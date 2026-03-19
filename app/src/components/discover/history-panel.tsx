"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Undo2, ChevronDown, ChevronRight, Clock, Loader2 } from "lucide-react";

interface ActionEntry {
  id: string;
  actionType: string;
  actor: string;
  targetType: string;
  targetId: string | null;
  targetName: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  revertedAt: string | null;
  beforeSnapshot?: Record<string, unknown>;
  afterSnapshot?: Record<string, unknown>;
  choices?: Record<string, unknown>;
}

interface HistoryPanelProps {
  targetType?: string;
  targetId?: string;
}

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  enrichment: { label: "Enrichment", cls: "bg-green-600 text-white border-transparent" },
  scoring:    { label: "Scoring",    cls: "bg-blue-600 text-white border-transparent" },
  import:     { label: "Import",     cls: "bg-purple-600 text-white border-transparent" },
  revert:     { label: "Revert",     cls: "bg-orange-500 text-white border-transparent" },
  edit:       { label: "Edit",       cls: "bg-gray-500 text-white border-transparent" },
};

function summarise(e: ActionEntry): string {
  const m = e.metadata;
  if (typeof m.summary === "string") return m.summary;
  if (e.actionType === "revert") return `Reverted action on ${e.targetName ?? e.targetType}`;
  if (e.actionType === "enrichment") {
    const prov = typeof m.provider === "string" ? m.provider : "";
    const cnt = typeof m.fieldsChanged === "number" ? m.fieldsChanged : null;
    if (cnt !== null && prov) return `Enriched ${cnt} field${cnt !== 1 ? "s" : ""} via ${prov}`;
    if (prov) return `Enriched via ${prov}`;
    return "Enrichment performed";
  }
  return `${e.actionType} on ${e.targetName ?? e.targetType}`;
}

function diffFields(before: Record<string, unknown>, after: Record<string, unknown>) {
  const out: Array<{ field: string; oldVal: unknown; newVal: unknown }> = [];
  for (const k of Object.keys(after)) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      out.push({ field: k, oldVal: before[k], newVal: after[k] });
    }
  }
  return out;
}

function dv(v: unknown): string {
  if (v === null || v === undefined) return "(empty)";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

export function HistoryPanel({ targetType, targetId }: HistoryPanelProps) {
  const [actions, setActions] = useState<ActionEntry[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, ActionEntry>>({});
  const [reverting, setReverting] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const fetchActions = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ limit: "30" });
      if (targetType) p.set("targetType", targetType);
      if (targetId) p.set("targetId", targetId);
      const res = await fetch(`/api/actions?${p}`);
      if (!res.ok) throw new Error("fetch failed");
      setActions((await res.json()).data ?? []);
    } catch {
      setActions([]);
    } finally {
      setLoading(false);
    }
  }, [targetType, targetId]);

  useEffect(() => { fetchActions(); }, [fetchActions]);

  async function toggleExpand(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!detailCache[id]) {
      try {
        const res = await fetch(`/api/actions/${id}`);
        if (res.ok) {
          const json = await res.json();
          setDetailCache((prev) => ({ ...prev, [id]: json.data }));
        }
      } catch { /* detail unavailable */ }
    }
  }

  async function handleRevert(id: string) {
    if (!window.confirm("Revert this action? This will restore the previous values.")) return;
    setReverting(id);
    try {
      const res = await fetch(`/api/actions/${id}`, { method: "POST" });
      if (!res.ok) throw new Error("revert failed");
      setMessage("Action reverted");
      setTimeout(() => setMessage(null), 3000);
      setExpandedId(null);
      await fetchActions();
    } catch {
      setMessage("Revert failed");
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setReverting(null);
    }
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Clock className="h-4 w-4" />
          History
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto space-y-1 pr-2">
        {message && <p className="text-xs text-green-600 font-medium mb-1">{message}</p>}
        {loading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && actions.length === 0 && (
          <p className="text-xs text-muted-foreground py-4 text-center">
            No actions recorded yet.
          </p>
        )}
        {!loading && actions.map((entry) => {
          const badge = TYPE_BADGE[entry.actionType] ?? { label: entry.actionType, cls: "bg-muted text-foreground" };
          const isExpanded = expandedId === entry.id;
          const detail = detailCache[entry.id];
          const reverted = !!entry.revertedAt;
          return (
            <div key={entry.id} className={`rounded-md border px-3 py-2 text-xs ${reverted ? "opacity-50" : ""}`}>
              <button type="button" className="flex w-full items-start gap-2 text-left" onClick={() => toggleExpand(entry.id)}>
                {isExpanded
                  ? <ChevronDown className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  : <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge className={`text-[10px] px-1.5 py-0 ${badge.cls}`}>{badge.label}</Badge>
                    <span className="text-muted-foreground">{entry.actor}</span>
                    {entry.targetName && <span className="font-medium truncate">{entry.targetName}</span>}
                  </div>
                  <p className={reverted ? "line-through text-muted-foreground" : ""}>{summarise(entry)}</p>
                  <p className="text-muted-foreground text-[10px]">{new Date(entry.createdAt).toLocaleString()}</p>
                </div>
                {!reverted && entry.actionType !== "revert" && (
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0"
                    disabled={reverting === entry.id}
                    onClick={(e) => { e.stopPropagation(); handleRevert(entry.id); }}>
                    {reverting === entry.id
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Undo2 className="h-3 w-3" />}
                  </Button>
                )}
              </button>
              {isExpanded && (
                <div className="mt-2 ml-5 space-y-2 border-t pt-2">
                  {!detail && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Loading detail...
                    </div>
                  )}
                  {detail && (
                    <>
                      {reverted && detail.revertedAt && (
                        <p className="text-muted-foreground italic">
                          Reverted at {new Date(detail.revertedAt).toLocaleString()}
                        </p>
                      )}
                      <DiffView before={detail.beforeSnapshot ?? {}} after={detail.afterSnapshot ?? {}} />
                      {detail.choices && Object.keys(detail.choices).length > 0 && (
                        <div>
                          <p className="font-medium mb-0.5">Selected fields</p>
                          <pre className="bg-muted rounded p-1.5 text-[10px] overflow-x-auto">
                            {JSON.stringify(detail.choices, null, 2)}
                          </pre>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function DiffView({ before, after }: { before: Record<string, unknown>; after: Record<string, unknown> }) {
  const changes = diffFields(before, after);
  if (changes.length === 0) return <p className="text-muted-foreground">No field changes recorded.</p>;
  return (
    <div className="space-y-1">
      {changes.map(({ field, oldVal, newVal }) => (
        <div key={field} className="flex items-baseline gap-1 flex-wrap">
          <span className="font-medium">{field}:</span>
          <span className="text-red-500 line-through">{dv(oldVal)}</span>
          <span className="text-muted-foreground">&rarr;</span>
          <span className="text-green-600">{dv(newVal)}</span>
        </div>
      ))}
    </div>
  );
}
