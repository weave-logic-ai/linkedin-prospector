"use client";

import { useState } from "react";
import useSWR from "swr";
import { Shield, ShieldOff, AlertTriangle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface OverrideState {
  enabled: boolean;
  setAt: string;
  reason?: string;
}

export function OverrideToggle() {
  const { data, mutate } = useSWR<OverrideState>("/api/operations/override", fetcher, {
    refreshInterval: 5000,
  });
  const [toggling, setToggling] = useState(false);
  const [reason, setReason] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const enabled = data?.enabled ?? false;

  async function toggle() {
    if (!enabled && !showConfirm) {
      setShowConfirm(true);
      return;
    }

    setToggling(true);
    try {
      const res = await fetch("/api/operations/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: !enabled,
          ...(reason ? { reason } : {}),
        }),
      });
      const updated = await res.json();
      mutate(updated, false);
      setShowConfirm(false);
      setReason("");
    } finally {
      setToggling(false);
    }
  }

  function cancelConfirm() {
    setShowConfirm(false);
    setReason("");
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString();
  }

  return (
    <Card className={enabled ? "border-red-500/50 bg-red-500/5" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {enabled ? (
              <ShieldOff className="h-5 w-5 text-red-500" />
            ) : (
              <Shield className="h-5 w-5 text-emerald-500" />
            )}
            <CardTitle className="text-base">LinkedIn Override</CardTitle>
            <Badge variant={enabled ? "destructive" : "secondary"} className="text-[10px]">
              {enabled ? "ACTIVE" : "OFF"}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {enabled && (
          <div className="flex items-start gap-2 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">All Playwright scripts are blocked</div>
              {data?.reason && (
                <div className="text-xs text-red-400 mt-0.5">Reason: {data.reason}</div>
              )}
              {data?.setAt && (
                <div className="text-xs text-red-400/70 mt-0.5">Since {formatDate(data.setAt)}</div>
              )}
            </div>
          </div>
        )}

        {showConfirm && !enabled && (
          <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
            <div className="text-sm font-medium text-amber-500">Enable LinkedIn Override?</div>
            <div className="text-xs text-muted-foreground">
              This will block ALL Playwright scripts (search, enrich, deep-scan, activity-scanner).
            </div>
            <input
              type="text"
              placeholder="Reason (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={toggle} disabled={toggling}>
                {toggling ? "Enabling..." : "Enable Override"}
              </Button>
              <Button size="sm" variant="outline" onClick={cancelConfirm}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {!showConfirm && (
          <Button
            size="sm"
            variant={enabled ? "outline" : "destructive"}
            onClick={toggle}
            disabled={toggling}
            className="w-full"
          >
            {toggling
              ? "Updating..."
              : enabled
                ? "Disable Override"
                : "Enable LinkedIn Override"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
