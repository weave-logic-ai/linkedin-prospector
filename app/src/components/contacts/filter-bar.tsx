"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

const TIERS = ["gold", "silver", "bronze", "watch"] as const;
const DEGREES = [1, 2] as const;

interface FilterState {
  search: string;
  tiers: string[];
  degrees: number[];
  sort: string;
  order: string;
}

interface FilterBarProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}

export function FilterBar({ filters, onChange }: FilterBarProps) {
  const [localSearch, setLocalSearch] = useState(filters.search);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setLocalSearch(filters.search);
  }, [filters.search]);

  const handleSearchChange = useCallback(
    (value: string) => {
      setLocalSearch(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onChange({ ...filters, search: value });
      }, 300);
    },
    [filters, onChange]
  );

  const toggleTier = useCallback(
    (tier: string) => {
      const tiers = filters.tiers.includes(tier)
        ? filters.tiers.filter((t) => t !== tier)
        : [...filters.tiers, tier];
      onChange({ ...filters, tiers });
    },
    [filters, onChange]
  );

  const toggleDegree = useCallback(
    (degree: number) => {
      const degrees = filters.degrees.includes(degree)
        ? filters.degrees.filter((d) => d !== degree)
        : [...filters.degrees, degree];
      onChange({ ...filters, degrees });
    },
    [filters, onChange]
  );

  const handleSortChange = useCallback(
    (value: string) => {
      onChange({ ...filters, sort: value });
    },
    [filters, onChange]
  );

  const clearAll = useCallback(() => {
    setLocalSearch("");
    onChange({
      search: "",
      tiers: [],
      degrees: [],
      sort: "goldScore",
      order: "desc",
    });
  }, [onChange]);

  const hasActiveFilters =
    filters.search ||
    filters.tiers.length > 0 ||
    filters.degrees.length > 0 ||
    filters.sort !== "goldScore";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative min-w-[240px] flex-1 max-w-sm">
          <Input
            placeholder="Search name, title, company..."
            value={localSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pr-8"
          />
          {localSearch && (
            <button
              onClick={() => handleSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Tier chips */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground mr-1">Tier:</span>
          {TIERS.map((tier) => (
            <button
              key={tier}
              onClick={() => toggleTier(tier)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors ${
                filters.tiers.includes(tier)
                  ? tier === "gold"
                    ? "bg-[hsl(var(--tier-gold)/0.2)] text-[hsl(var(--tier-gold))] border-[hsl(var(--tier-gold)/0.4)]"
                    : tier === "silver"
                    ? "bg-[hsl(var(--tier-silver)/0.2)] text-[hsl(var(--tier-silver))] border-[hsl(var(--tier-silver)/0.4)]"
                    : tier === "bronze"
                    ? "bg-[hsl(var(--tier-bronze)/0.2)] text-[hsl(var(--tier-bronze))] border-[hsl(var(--tier-bronze)/0.4)]"
                    : "bg-[hsl(var(--tier-watch)/0.2)] text-[hsl(var(--tier-watch))] border-[hsl(var(--tier-watch)/0.4)]"
                  : "bg-transparent text-muted-foreground border-border hover:bg-muted"
              }`}
            >
              {tier.charAt(0).toUpperCase() + tier.slice(1)}
            </button>
          ))}
        </div>

        {/* Degree filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground mr-1">Degree:</span>
          {DEGREES.map((d) => (
            <button
              key={d}
              onClick={() => toggleDegree(d)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors ${
                filters.degrees.includes(d)
                  ? "bg-primary/15 text-primary border-primary/40"
                  : "bg-transparent text-muted-foreground border-border hover:bg-muted"
              }`}
            >
              {d === 1 ? "1st" : "2nd"}
            </button>
          ))}
        </div>

        {/* Sort */}
        <Select
          value={filters.sort}
          onChange={(e) => handleSortChange(e.target.value)}
          className="w-[160px]"
        >
          <option value="goldScore">Gold Score</option>
          <option value="icpFit">ICP Fit</option>
          <option value="networkHub">Network Hub</option>
          <option value="behavioralScore">Behavioral</option>
          <option value="mutualConnections">Mutual Conn.</option>
          <option value="name">Name</option>
        </Select>
      </div>

      {/* Active filter pills */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.search && (
            <Badge variant="secondary" className="gap-1">
              Search: {filters.search}
              <button onClick={() => handleSearchChange("")}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.tiers.map((tier) => (
            <Badge
              key={tier}
              variant={tier as "gold" | "silver" | "bronze" | "watch"}
              className="gap-1"
            >
              {tier}
              <button onClick={() => toggleTier(tier)}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {filters.degrees.map((d) => (
            <Badge key={d} variant="secondary" className="gap-1">
              {d === 1 ? "1st degree" : "2nd degree"}
              <button onClick={() => toggleDegree(d)}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
            className="h-6 text-xs text-muted-foreground"
          >
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
}
