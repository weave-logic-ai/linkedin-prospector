"use client";

import { useState, useCallback } from "react";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { Search, CheckCircle, Loader2, RefreshCw, X, Eye, AlertCircle, ShieldOff } from "lucide-react";

interface InvestigateCellProps {
  contactId: string;
  profileUrl: string;
  deepScanned: boolean;
  deepScannedAt: string | null;
  deepScanResults: number;
}

export function InvestigateCell({
  contactId,
  profileUrl,
  deepScanned,
  deepScannedAt,
  deepScanResults,
}: InvestigateCellProps) {
  const [scanning, setScanning] = useState(false);
  const [processId, setProcessId] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [blockedReason, setBlockedReason] = useState<string>("");

  const triggerScan = useCallback(async () => {
    setScanning(true);
    setCancelled(false);
    setBlocked(false);
    try {
      const res = await fetch("/api/actions/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptId: "enrich", params: { url: profileUrl } }),
      });
      const data = await res.json();
      if (res.status === 409 || data.status === "blocked") {
        setScanning(false);
        setBlocked(true);
        setBlockedReason(data.reason || "LinkedIn override active");
        return;
      }
      if (data.processId) {
        setProcessId(data.processId);
        pollCompletion(data.processId);
      } else {
        setScanning(false);
      }
    } catch {
      setScanning(false);
    }
  }, [profileUrl]);

  const cancelScan = useCallback(async () => {
    if (!processId) return;
    try {
      await fetch("/api/actions/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processId }),
      });
      setCancelled(true);
      setScanning(false);
      setProcessId(null);
    } catch {
      /* ignore */
    }
  }, [processId]);

  async function pollCompletion(pid: string) {
    const maxAttempts = 60;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const res = await fetch("/api/actions/active");
        const data = await res.json();
        const active = Array.isArray(data) ? data : (data.processes || []);
        if (!active.some((p: { id: string }) => p.id === pid)) {
          setScanning(false);
          setProcessId(null);
          return;
        }
      } catch { break; }
    }
    setScanning(false);
    setProcessId(null);
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) return "today";
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  // Scanning state
  if (scanning) {
    return (
      <HoverCard>
        <HoverCardTrigger>
          <div className="inline-flex items-center gap-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
            <span className="text-[10px] font-medium text-amber-500">Scanning</span>
            <button
              onClick={(e) => { e.stopPropagation(); cancelScan(); }}
              className="rounded-full p-0.5 hover:bg-red-500/15 text-red-400 hover:text-red-500 transition-colors"
              title="Cancel scan"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </HoverCardTrigger>
        <HoverCardContent side="bottom" align="start" className="w-64">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
              <div>
                <div className="text-sm font-medium">Enrichment Running</div>
                <div className="text-[10px] text-muted-foreground">Enriching profile data, posts, activity</div>
              </div>
            </div>
            {processId && (
              <div className="text-[10px] text-muted-foreground font-mono bg-muted/50 rounded px-2 py-1">
                Process: {processId}
              </div>
            )}
            <button
              onClick={cancelScan}
              className="w-full flex items-center justify-center gap-1.5 rounded bg-red-500/10 px-2 py-1.5 text-xs text-red-500 hover:bg-red-500/20 transition-colors"
            >
              <X className="h-3 w-3" /> Cancel Scan
            </button>
          </div>
        </HoverCardContent>
      </HoverCard>
    );
  }

  // Cancelled state
  if (cancelled) {
    return (
      <HoverCard>
        <HoverCardTrigger>
          <button
            onClick={triggerScan}
            className="inline-flex items-center gap-1 text-orange-400 hover:text-orange-300 transition-colors"
          >
            <AlertCircle className="h-3.5 w-3.5" />
            <span className="text-[10px]">Cancelled</span>
          </button>
        </HoverCardTrigger>
        <HoverCardContent side="bottom" align="start" className="w-56">
          <div className="text-xs text-muted-foreground">Scan was cancelled. Click to restart.</div>
        </HoverCardContent>
      </HoverCard>
    );
  }

  // Blocked state
  if (blocked) {
    return (
      <HoverCard>
        <HoverCardTrigger>
          <button
            onClick={() => { setBlocked(false); triggerScan(); }}
            className="inline-flex items-center gap-1 text-orange-400 hover:text-orange-300 transition-colors"
          >
            <ShieldOff className="h-3.5 w-3.5" />
            <span className="text-[10px]">Blocked</span>
          </button>
        </HoverCardTrigger>
        <HoverCardContent side="bottom" align="start" className="w-56">
          <div className="text-xs text-muted-foreground">{blockedReason}. Click to retry.</div>
        </HoverCardContent>
      </HoverCard>
    );
  }

  // Scanned state
  if (deepScanned) {
    return (
      <HoverCard>
        <HoverCardTrigger>
          <button
            onClick={triggerScan}
            className="inline-flex items-center gap-1 text-emerald-500 hover:text-emerald-400 transition-colors"
          >
            <CheckCircle className="h-3.5 w-3.5" />
            {deepScanResults > 0 && (
              <span className="text-[10px] font-semibold">{deepScanResults}</span>
            )}
            <RefreshCw className="h-2.5 w-2.5 opacity-0 group-hover:opacity-50" />
          </button>
        </HoverCardTrigger>
        <HoverCardContent side="bottom" align="start" className="w-64">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              <div>
                <div className="text-sm font-medium">Enriched</div>
                <div className="text-[10px] text-muted-foreground">
                  Enriched {deepScannedAt ? formatDate(deepScannedAt) : "recently"}
                </div>
              </div>
            </div>
            {deepScanResults > 0 && (
              <div className="flex items-center gap-2 rounded bg-emerald-500/10 px-2 py-1.5">
                <Eye className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-xs text-emerald-600 font-medium">
                  {deepScanResults} enrichment data points
                </span>
              </div>
            )}
            <button
              onClick={triggerScan}
              className="w-full flex items-center justify-center gap-1.5 rounded bg-muted px-2 py-1.5 text-xs hover:bg-muted/80 transition-colors"
            >
              <RefreshCw className="h-3 w-3" /> Re-scan
            </button>
          </div>
        </HoverCardContent>
      </HoverCard>
    );
  }

  // Not scanned state
  return (
    <HoverCard>
      <HoverCardTrigger>
        <button
          onClick={triggerScan}
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Search className="h-3.5 w-3.5" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="bottom" align="start" className="w-56">
        <div className="space-y-1.5">
          <div className="text-xs font-medium">Investigate Profile</div>
          <div className="text-[10px] text-muted-foreground">
            Scans this contact&apos;s full profile -- recent posts, likes, comments, connections, and activity patterns.
          </div>
          <div className="text-[10px] text-muted-foreground/70">Click to start</div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
