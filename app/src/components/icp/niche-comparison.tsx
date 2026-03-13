"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { NicheData } from "./icp-content";

type SortColumn =
  | "label"
  | "contactCount"
  | "goldCount"
  | "goldDensity"
  | "avgGoldScore"
  | "avgIcpFit"
  | "avgNetworkHub";

interface NicheComparisonProps {
  niches: NicheData[];
}

const COLUMNS: { key: SortColumn; label: string; format?: (v: number) => string }[] = [
  { key: "label", label: "Niche" },
  { key: "contactCount", label: "Contacts" },
  { key: "goldCount", label: "Gold" },
  {
    key: "goldDensity",
    label: "Gold %",
    format: (v: number) => `${(v * 100).toFixed(1)}%`,
  },
  {
    key: "avgGoldScore",
    label: "Avg Score",
    format: (v: number) => (v * 100).toFixed(0),
  },
  {
    key: "avgIcpFit",
    label: "ICP Fit",
    format: (v: number) => (v * 100).toFixed(0),
  },
  {
    key: "avgNetworkHub",
    label: "Hub",
    format: (v: number) => (v * 100).toFixed(0),
  },
];

export function NicheComparison({ niches }: NicheComparisonProps) {
  const [sortCol, setSortCol] = useState<SortColumn>("goldDensity");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const copy = [...niches];
    copy.sort((a, b) => {
      const aVal = a[sortCol];
      const bVal = b[sortCol];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      const numA = Number(aVal) || 0;
      const numB = Number(bVal) || 0;
      return sortDir === "asc" ? numA - numB : numB - numA;
    });
    return copy;
  }, [niches, sortCol, sortDir]);

  // Find max value per numeric column for highlighting
  const maxValues = useMemo(() => {
    const maxes: Partial<Record<SortColumn, number>> = {};
    for (const col of COLUMNS) {
      if (col.key === "label") continue;
      let max = -Infinity;
      for (const n of niches) {
        const v = Number(n[col.key]) || 0;
        if (v > max) max = v;
      }
      maxes[col.key] = max;
    }
    return maxes;
  }, [niches]);

  function handleSort(col: SortColumn) {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir(col === "label" ? "asc" : "desc");
    }
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "px-3 py-2 text-left font-medium text-muted-foreground cursor-pointer select-none",
                    "hover:text-foreground transition-colors",
                    col.key !== "label" && "text-right",
                  )}
                  onClick={() => handleSort(col.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {sortCol === col.key && (
                      <span className="text-primary">
                        {sortDir === "asc" ? "\u2191" : "\u2193"}
                      </span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((niche) => (
              <tr
                key={niche.id}
                className="border-b border-border/50 hover:bg-accent/30 transition-colors"
              >
                {COLUMNS.map((col) => {
                  const value = niche[col.key];
                  const isMax =
                    col.key !== "label" &&
                    Number(value) === maxValues[col.key] &&
                    maxValues[col.key]! > 0;

                  if (col.key === "label") {
                    return (
                      <td key={col.key} className="px-3 py-2 font-medium capitalize">
                        {String(value)}
                      </td>
                    );
                  }

                  const formatted = col.format
                    ? col.format(Number(value))
                    : String(value);

                  return (
                    <td
                      key={col.key}
                      className={cn(
                        "px-3 py-2 text-right tabular-nums",
                        isMax && "text-primary font-semibold",
                      )}
                    >
                      {formatted}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
