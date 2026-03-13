import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      {/* Header skeleton */}
      <div>
        <Skeleton className="h-5 w-28" />
        <Skeleton className="mt-1 h-3 w-40" />
      </div>

      {/* Row 1: 4 KPI cards */}
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="h-[120px]">
            <CardContent className="flex h-full flex-col justify-center p-4">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="mt-2 h-3 w-24" />
              <Skeleton className="mt-1 h-2.5 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Row 3: 2 wide cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="col-span-2">
          <CardHeader className="pb-3">
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-2.5 w-56" />
                </div>
                <Skeleton className="h-5 w-8" />
                <Skeleton className="h-1.5 w-16" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="col-span-2">
          <CardHeader className="pb-3">
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-48" />
                  <Skeleton className="h-2.5 w-64" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Quick actions */}
      <Card className="col-span-4">
        <CardHeader className="pb-3">
          <Skeleton className="h-4 w-24" />
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-36 rounded-md" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
