"use client";

import * as React from "react";
import useSWR from "swr";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface BudgetData {
  date: string;
  operations: Record<
    string,
    {
      used: number;
      limit: number;
    }
  >;
}

const operationLabels: Record<string, string> = {
  profile_visits: "Profile Visits",
  connection_requests: "Connection Requests",
  messages_sent: "Messages Sent",
  search_pages: "Search Pages",
  activity_feeds: "Activity Feeds",
};

const operationColors: Record<string, string> = {
  profile_visits: "bg-blue-500",
  connection_requests: "bg-emerald-500",
  messages_sent: "bg-violet-500",
  search_pages: "bg-amber-500",
  activity_feeds: "bg-rose-500",
};

export function BudgetSidebar() {
  const { data, error } = useSWR<BudgetData>("/api/budget", fetcher, {
    refreshInterval: 30000,
  });

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Rate Budget</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Failed to load budget data
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Rate Budget</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <div className="h-3 w-24 rounded bg-muted animate-pulse" />
                <div className="h-2 w-full rounded bg-muted animate-pulse" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const operations = data.operations || {};

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Rate Budget</CardTitle>
          <span className="text-[10px] text-muted-foreground font-mono">
            {data.date}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.entries(operations).map(([key, op]) => {
          const percentage = op.limit > 0 ? (op.used / op.limit) * 100 : 0;
          const label = operationLabels[key] || key;
          const color = operationColors[key] || "bg-primary";

          return (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-mono tabular-nums">
                  {op.used}/{op.limit}
                </span>
              </div>
              <Progress
                value={op.used}
                max={op.limit}
                indicatorClassName={color}
              />
            </div>
          );
        })}

        {Object.keys(operations).length === 0 && (
          <p className="text-xs text-muted-foreground">
            No budget data available
          </p>
        )}
      </CardContent>
    </Card>
  );
}
