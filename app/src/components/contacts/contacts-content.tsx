"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";
import { FilterBar } from "@/components/contacts/filter-bar";
import { ContactsTable } from "@/components/contacts/contacts-table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface FilterState {
  search: string;
  tiers: string[];
  degrees: number[];
  sort: string;
  order: string;
}

function buildUrl(filters: FilterState, page: number, pageSize: number): string {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  params.set("sort", filters.sort);
  params.set("order", filters.order);
  if (filters.search) params.set("search", filters.search);
  if (filters.tiers.length > 0) params.set("tier", filters.tiers.join(","));
  if (filters.degrees.length > 0) params.set("degree", filters.degrees.join(","));
  return `/api/contacts?${params.toString()}`;
}

export function ContactsContent() {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [filters, setFilters] = useState<FilterState>({
    search: "",
    tiers: [],
    degrees: [],
    sort: "goldScore",
    order: "desc",
  });

  const url = buildUrl(filters, page, pageSize);
  const { data, isLoading, error } = useSWR(url, fetcher, {
    keepPreviousData: true,
  });

  const handleFilterChange = useCallback((newFilters: FilterState) => {
    setFilters(newFilters);
    setPage(1);
  }, []);

  const handleSort = useCallback(
    (field: string) => {
      if (filters.sort === field) {
        setFilters((f) => ({
          ...f,
          order: f.order === "desc" ? "asc" : "desc",
        }));
      } else {
        setFilters((f) => ({ ...f, sort: field, order: "desc" }));
      }
      setPage(1);
    },
    [filters.sort]
  );

  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-semibold">Contacts</h1>
            <p className="text-sm text-muted-foreground">
              {isLoading ? "Loading..." : `${total.toLocaleString()} contacts`}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <FilterBar filters={filters} onChange={handleFilterChange} />

      {/* Table */}
      <div className="rounded-lg border bg-card">
        {error ? (
          <div className="p-8 text-center text-destructive">
            Failed to load contacts. Check that graph.json is available.
          </div>
        ) : isLoading && !data ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <ContactsTable
            contacts={data?.contacts ?? []}
            sort={filters.sort}
            order={filters.order}
            onSort={handleSort}
          />
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page} of {totalPages} ({total.toLocaleString()} total)
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            {/* Page number buttons */}
            <div className="flex items-center gap-1">
              {generatePageNumbers(page, totalPages).map((p, i) =>
                p === "..." ? (
                  <span key={`ellipsis-${i}`} className="px-1 text-muted-foreground">
                    ...
                  </span>
                ) : (
                  <Button
                    key={p}
                    variant={p === page ? "default" : "outline"}
                    size="sm"
                    className="w-8 h-8 p-0"
                    onClick={() => setPage(p as number)}
                  >
                    {p}
                  </Button>
                )
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function generatePageNumbers(
  current: number,
  total: number
): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [];
  if (current <= 4) {
    for (let i = 1; i <= 5; i++) pages.push(i);
    pages.push("...", total);
  } else if (current >= total - 3) {
    pages.push(1, "...");
    for (let i = total - 4; i <= total; i++) pages.push(i);
  } else {
    pages.push(1, "...", current - 1, current, current + 1, "...", total);
  }
  return pages;
}
