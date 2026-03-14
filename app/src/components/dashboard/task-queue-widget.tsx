"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ListTodo } from "lucide-react";

interface TaskItem {
  id: string;
  title: string;
  priority: "high" | "medium" | "low";
  dueDate: string | null;
}

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-red-500/15 text-red-700 border-red-500/30 dark:text-red-400",
  medium: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30 dark:text-yellow-400",
  low: "bg-green-500/15 text-green-700 border-green-500/30 dark:text-green-400",
};

export function TaskQueueWidget() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/dashboard");
        if (res.ok) {
          const json = await res.json();
          const pendingTasks = json.data?.pendingTasks ?? [];
          setTasks(
            pendingTasks.slice(0, 5).map((t: Record<string, unknown>) => ({
              id: t.id as string,
              title: (t.title as string) || "Untitled task",
              priority: (t.priority as string) || "medium",
              dueDate: (t.due_date as string) ?? (t.dueDate as string) ?? null,
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

  function formatDueDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.ceil(
      (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diffDays < 0) return "Overdue";
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Task Queue</CardTitle>
          <Link
            href="/tasks"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            View All
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
            Loading...
          </div>
        ) : tasks.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <ListTodo className="h-8 w-8 opacity-40" />
            <span>No pending tasks</span>
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors"
              >
                <div className="min-w-0 flex-1 mr-2">
                  <p className="text-sm truncate">{task.title}</p>
                  {task.dueDate && (
                    <p
                      className={`text-xs ${
                        new Date(task.dueDate) < new Date()
                          ? "text-red-600 dark:text-red-400"
                          : "text-muted-foreground"
                      }`}
                    >
                      {formatDueDate(task.dueDate)}
                    </p>
                  )}
                </div>
                <Badge
                  className={PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium}
                  variant="outline"
                >
                  {task.priority}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
