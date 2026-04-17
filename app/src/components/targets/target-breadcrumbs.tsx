"use client";

// Target breadcrumbs — global header trail showing:
//   Self  >  [Secondary]   [T]
//
// WS-4 Phase 1 Track B. When secondary is unset only "Self" renders.
// Clicking the secondary crumb clears the secondary target. The `T` shortcut
// hint opens the target picker (keyboard handled by TargetPickerModal).
//
// Gated behind RESEARCH_FLAGS.targets at the layout boundary — this component
// assumes it is only mounted when the flag is on.

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";

interface TargetStateDto {
  primaryTargetId: string | null;
  secondaryTargetId: string | null;
}

interface TargetDto {
  id: string;
  label: string;
  kind: "self" | "contact" | "company";
}

interface TargetBreadcrumbsProps {
  initialPrimaryLabel?: string;
  initialSecondaryLabel?: string | null;
  initialSecondaryTargetId?: string | null;
}

export function TargetBreadcrumbs({
  initialPrimaryLabel = "Self",
  initialSecondaryLabel = null,
  initialSecondaryTargetId = null,
}: TargetBreadcrumbsProps) {
  const [primaryLabel] = useState(initialPrimaryLabel);
  const [secondaryLabel, setSecondaryLabel] = useState<string | null>(
    initialSecondaryLabel
  );
  const [secondaryId, setSecondaryId] = useState<string | null>(
    initialSecondaryTargetId
  );

  // Keep the component in sync if another tab / page updated the state.
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const res = await fetch("/api/targets/state");
        if (!res.ok) return;
        const json = (await res.json()) as { data: TargetStateDto | null };
        if (cancelled || !json.data) return;
        if (!json.data.secondaryTargetId) {
          setSecondaryLabel(null);
          setSecondaryId(null);
          return;
        }
        if (json.data.secondaryTargetId === secondaryId) return;
        // Resolve the new secondary label.
        const targetRes = await fetch(
          `/api/targets?id=${json.data.secondaryTargetId}`
        );
        if (!targetRes.ok) return;
        const targetJson = (await targetRes.json()) as { data: TargetDto | null };
        if (cancelled || !targetJson.data) return;
        setSecondaryLabel(targetJson.data.label);
        setSecondaryId(targetJson.data.id);
      } catch {
        // Silent — breadcrumbs tolerate transient fetch failures.
      }
    }
    void refresh();
    return () => {
      cancelled = true;
    };
  }, [secondaryId]);

  const handleClearSecondary = useCallback(async () => {
    try {
      await fetch("/api/targets/state", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ secondaryTargetId: null }),
      });
      setSecondaryLabel(null);
      setSecondaryId(null);
    } catch {
      // Silent — state hasn't changed, user can retry.
    }
  }, []);

  return (
    <nav
      aria-label="Research target breadcrumbs"
      className="flex items-center gap-2 border-b border-border/40 bg-muted/20 px-4 py-1.5 text-xs text-muted-foreground"
    >
      <span className="font-medium text-foreground">{primaryLabel}</span>
      {secondaryLabel ? (
        <>
          <span aria-hidden="true">&rsaquo;</span>
          <span className="flex items-center gap-1 font-medium text-foreground">
            {secondaryLabel}
            <button
              type="button"
              onClick={handleClearSecondary}
              className="rounded p-0.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label={`Clear secondary target ${secondaryLabel}`}
            >
              <X className="size-3" />
            </button>
          </span>
        </>
      ) : null}
      <span className="ml-auto rounded border border-border/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
        Press <kbd className="font-mono">T</kbd> to switch
      </span>
    </nav>
  );
}
