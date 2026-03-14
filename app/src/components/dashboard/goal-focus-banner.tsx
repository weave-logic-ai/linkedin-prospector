"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Target } from "lucide-react";

interface GoalData {
  id: string;
  title: string;
  currentValue: number;
  targetValue: number;
  deadline: string | null;
}

export function GoalFocusBanner() {
  const [goal, setGoal] = useState<GoalData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/dashboard");
        if (res.ok) {
          const json = await res.json();
          const activeGoal = json.data?.activeGoal ?? null;
          if (activeGoal) {
            setGoal({
              id: activeGoal.id,
              title: activeGoal.title,
              currentValue: activeGoal.current_value ?? activeGoal.currentValue ?? 0,
              targetValue: activeGoal.target_value ?? activeGoal.targetValue ?? 1,
              deadline: activeGoal.deadline ?? null,
            });
          }
        }
      } catch {
        // Empty state
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200/50 dark:border-blue-800/50">
        <CardContent className="py-4">
          <div className="h-10 flex items-center justify-center text-sm text-muted-foreground">
            Loading...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!goal) {
    return (
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200/50 dark:border-blue-800/50">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <Target className="h-5 w-5 text-blue-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Set up your first goal to get started</p>
              <p className="text-xs text-muted-foreground">
                Goals help you track your prospecting progress
              </p>
            </div>
            <Link
              href="/goals"
              className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium whitespace-nowrap"
            >
              Create Goal
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  const progressPercent =
    goal.targetValue > 0
      ? Math.min(Math.round((goal.currentValue / goal.targetValue) * 100), 100)
      : 0;

  const daysRemaining = goal.deadline
    ? Math.max(
        0,
        Math.ceil(
          (new Date(goal.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        )
      )
    : null;

  return (
    <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200/50 dark:border-blue-800/50">
      <CardContent className="py-4">
        <div className="flex items-center gap-3">
          <Target className="h-5 w-5 text-blue-500 flex-shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium truncate">{goal.title}</p>
              <div className="flex items-center gap-3 flex-shrink-0 text-xs text-muted-foreground">
                <span>
                  {goal.currentValue} / {goal.targetValue}
                </span>
                {daysRemaining !== null && (
                  <span
                    className={
                      daysRemaining <= 3
                        ? "text-orange-600 dark:text-orange-400 font-medium"
                        : ""
                    }
                  >
                    {daysRemaining === 0
                      ? "Due today"
                      : daysRemaining === 1
                        ? "1 day left"
                        : `${daysRemaining} days left`}
                  </span>
                )}
              </div>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
