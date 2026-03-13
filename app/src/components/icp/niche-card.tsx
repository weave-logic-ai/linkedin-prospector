"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { NicheData } from "./icp-content";

interface NicheCardProps {
  niche: NicheData;
}

export function NicheCard({ niche }: NicheCardProps) {
  const total = niche.contactCount;
  const goldPct = total > 0 ? (niche.goldCount / total) * 100 : 0;
  const silverPct = total > 0 ? (niche.silverCount / total) * 100 : 0;
  const bronzePct = total > 0 ? (niche.bronzeCount / total) * 100 : 0;
  const watchPct = total > 0 ? (niche.watchCount / total) * 100 : 0;

  return (
    <Link
      href={`/icp/${encodeURIComponent(niche.id)}`}
      className={cn(
        "block rounded-lg border border-border bg-card p-4 space-y-3",
        "transition-colors hover:border-primary/40 hover:bg-accent/30",
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold capitalize">{niche.label}</h3>
          <p className="text-[11px] text-muted-foreground">
            {niche.contactCount} contacts
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {niche.goldCount > 0 && (
            <Badge variant="gold" className="h-5 px-1.5 text-[10px]">
              {niche.goldCount} gold
            </Badge>
          )}
        </div>
      </div>

      {/* Tier stacked bar */}
      <div className="space-y-1">
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
          {goldPct > 0 && (
            <div
              className="bg-[hsl(var(--tier-gold))]"
              style={{ width: `${goldPct}%` }}
              title={`Gold: ${niche.goldCount}`}
            />
          )}
          {silverPct > 0 && (
            <div
              className="bg-[hsl(var(--tier-silver))]"
              style={{ width: `${silverPct}%` }}
              title={`Silver: ${niche.silverCount}`}
            />
          )}
          {bronzePct > 0 && (
            <div
              className="bg-[hsl(var(--tier-bronze))]"
              style={{ width: `${bronzePct}%` }}
              title={`Bronze: ${niche.bronzeCount}`}
            />
          )}
          {watchPct > 0 && (
            <div
              className="bg-[hsl(var(--tier-watch))]"
              style={{ width: `${watchPct}%` }}
              title={`Watch: ${niche.watchCount}`}
            />
          )}
        </div>
        <div className="flex justify-between text-[9px] text-muted-foreground tabular-nums">
          <span>Gold {goldPct.toFixed(0)}%</span>
          <span>Silver {silverPct.toFixed(0)}%</span>
          <span>Bronze {bronzePct.toFixed(0)}%</span>
        </div>
      </div>

      {/* Score summary */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-sm font-semibold tabular-nums">
            {(niche.avgGoldScore * 100).toFixed(0)}
          </div>
          <div className="text-[9px] text-muted-foreground">Avg Score</div>
        </div>
        <div>
          <div className="text-sm font-semibold tabular-nums">
            {(niche.avgIcpFit * 100).toFixed(0)}
          </div>
          <div className="text-[9px] text-muted-foreground">ICP Fit</div>
        </div>
        <div>
          <div className="text-sm font-semibold tabular-nums">
            {(niche.avgNetworkHub * 100).toFixed(0)}
          </div>
          <div className="text-[9px] text-muted-foreground">Hub Score</div>
        </div>
      </div>

      {/* Top contacts preview */}
      {niche.topContacts.length > 0 && (
        <div className="space-y-1 pt-1 border-t border-border">
          <div className="text-[9px] text-muted-foreground uppercase tracking-wider">
            Top contacts
          </div>
          {niche.topContacts.map((c, i) => (
            <div key={i} className="flex items-center justify-between text-[11px]">
              <span className="truncate flex-1 mr-2">{c.name}</span>
              <span className="text-muted-foreground tabular-nums shrink-0">
                {(c.goldScore * 100).toFixed(0)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Link>
  );
}
