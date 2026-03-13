"use client";

import { useState, useCallback } from "react";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { Share2, Users, Loader2, GitBranch, X, AlertCircle } from "lucide-react";

interface ExploreCellProps {
  contactId: string;
  profileUrl: string;
  degree: number;
  deepScanned: boolean;
  deepScanResults: number;
}

export function ExploreCell({
  contactId,
  profileUrl,
  degree,
  deepScanned,
  deepScanResults,
}: ExploreCellProps) {
  const [expanding, setExpanding] = useState(false);
  const [processId, setProcessId] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);

  const triggerExpand = useCallback(async () => {
    setExpanding(true);
    setCancelled(false);
    try {
      const res = await fetch("/api/actions/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptId: "deep-scan", params: { url: profileUrl } }),
      });
      const data = await res.json();
      if (data.id) {
        setProcessId(data.id);
        pollCompletion(data.id);
      } else {
        setExpanding(false);
      }
    } catch {
      setExpanding(false);
    }
  }, [profileUrl]);

  const cancelExpand = useCallback(async () => {
    if (!processId) return;
    try {
      await fetch("/api/actions/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processId }),
      });
      setCancelled(true);
      setExpanding(false);
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
          setExpanding(false);
          setProcessId(null);
          return;
        }
      } catch { break; }
    }
    setExpanding(false);
    setProcessId(null);
  }

  // Expanding state
  if (expanding) {
    return (
      <HoverCard>
        <HoverCardTrigger>
          <div className="inline-flex items-center gap-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-500" />
            <span className="text-[10px] font-medium text-sky-500">Expanding</span>
            <button
              onClick={(e) => { e.stopPropagation(); cancelExpand(); }}
              className="rounded-full p-0.5 hover:bg-red-500/15 text-red-400 hover:text-red-500 transition-colors"
              title="Cancel expansion"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </HoverCardTrigger>
        <HoverCardContent side="bottom" align="start" className="w-64">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-sky-500" />
              <div>
                <div className="text-sm font-medium">Network Expansion</div>
                <div className="text-[10px] text-muted-foreground">Discovering 2nd-degree connections</div>
              </div>
            </div>
            <button
              onClick={cancelExpand}
              className="w-full flex items-center justify-center gap-1.5 rounded bg-red-500/10 px-2 py-1.5 text-xs text-red-500 hover:bg-red-500/20 transition-colors"
            >
              <X className="h-3 w-3" /> Cancel
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
            onClick={triggerExpand}
            className="inline-flex items-center gap-1 text-orange-400 hover:text-orange-300 transition-colors"
          >
            <AlertCircle className="h-3.5 w-3.5" />
          </button>
        </HoverCardTrigger>
        <HoverCardContent side="bottom" align="start" className="w-56">
          <div className="text-xs text-muted-foreground">Expansion cancelled. Click to restart.</div>
        </HoverCardContent>
      </HoverCard>
    );
  }

  // Expanded with results
  if (deepScanned && deepScanResults > 0) {
    return (
      <HoverCard>
        <HoverCardTrigger>
          <button
            onClick={triggerExpand}
            className="inline-flex items-center gap-1 text-sky-500 hover:text-sky-400 transition-colors"
          >
            <GitBranch className="h-3.5 w-3.5" />
            <span className="text-[10px] font-semibold">{deepScanResults}</span>
          </button>
        </HoverCardTrigger>
        <HoverCardContent side="bottom" align="start" className="w-64">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-sky-500" />
              <div>
                <div className="text-sm font-medium">Network Expanded</div>
                <div className="text-[10px] text-muted-foreground">
                  {deepScanResults} 2nd-degree contacts discovered
                </div>
              </div>
            </div>
            <button
              onClick={triggerExpand}
              className="w-full flex items-center justify-center gap-1.5 rounded bg-muted px-2 py-1.5 text-xs hover:bg-muted/80 transition-colors"
            >
              <Share2 className="h-3 w-3" /> Re-expand
            </button>
          </div>
        </HoverCardContent>
      </HoverCard>
    );
  }

  // 2nd degree
  if (degree === 2) {
    return (
      <HoverCard>
        <HoverCardTrigger>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Users className="h-3 w-3" />
            <span className="text-[10px]">2nd&deg;</span>
          </span>
        </HoverCardTrigger>
        <HoverCardContent side="bottom" align="start" className="w-56">
          <div className="space-y-1">
            <div className="text-xs font-medium">2nd-Degree Contact</div>
            <div className="text-[10px] text-muted-foreground">
              This person is a connection of a connection. Connect with them first to explore their network.
            </div>
          </div>
        </HoverCardContent>
      </HoverCard>
    );
  }

  // 1st degree, not explored
  return (
    <HoverCard>
      <HoverCardTrigger>
        <button
          onClick={triggerExpand}
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-sky-500 transition-colors"
        >
          <Share2 className="h-3.5 w-3.5" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="bottom" align="start" className="w-56">
        <div className="space-y-1.5">
          <div className="text-xs font-medium">Explore Network</div>
          <div className="text-[10px] text-muted-foreground">
            Discover this contact&apos;s connections to find 2nd-degree prospects, hubs, and ICP-fit contacts.
          </div>
          <div className="text-[10px] text-muted-foreground/70">Click to start</div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
