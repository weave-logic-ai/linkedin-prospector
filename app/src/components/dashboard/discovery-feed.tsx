"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, BarChart3, Upload, Sparkles, Activity } from "lucide-react";

interface DiscoveryItem {
  type: string;
  message: string;
  timestamp: string;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  cluster: <Sparkles className="h-3.5 w-3.5 text-purple-500" />,
  scored: <BarChart3 className="h-3.5 w-3.5 text-blue-500" />,
  import: <Upload className="h-3.5 w-3.5 text-green-500" />,
  contacts: <Users className="h-3.5 w-3.5 text-orange-500" />,
};

const DEFAULT_ICON = <Activity className="h-3.5 w-3.5 text-muted-foreground" />;

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function DiscoveryFeed() {
  const [items, setItems] = useState<DiscoveryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/dashboard");
        if (res.ok) {
          const json = await res.json();
          const recentActivity = json.data?.recentActivity ?? [];
          setItems(
            recentActivity.slice(0, 5).map((a: Record<string, unknown>) => ({
              type: (a.type as string) || "activity",
              message: (a.message as string) || "",
              timestamp: (a.timestamp as string) || new Date().toISOString(),
            }))
          );
        }
      } catch {
        // Empty state
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Discovery Feed</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
            Loading...
          </div>
        ) : items.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="h-8 w-8 opacity-40" />
            <span>Import data to see network insights</span>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex-shrink-0">
                  {TYPE_ICONS[item.type] || DEFAULT_ICON}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-foreground leading-snug">
                    {item.message}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatTimestamp(item.timestamp)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
