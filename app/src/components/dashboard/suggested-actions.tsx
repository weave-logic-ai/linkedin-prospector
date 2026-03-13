"use client";

import Link from "next/link";
import {
  Users,
  Building2,
  MessageCircle,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SuggestedAction {
  type: string;
  title: string;
  description: string;
  href: string;
  priority: number;
}

interface SuggestedActionsProps {
  actions: SuggestedAction[];
}

const typeIcons: Record<string, React.ElementType> = {
  "uncontacted-gold": Users,
  "company-penetration": Building2,
  "stale-followup": MessageCircle,
  "cluster-gap": AlertTriangle,
};

const typeColors: Record<string, string> = {
  "uncontacted-gold": "text-[hsl(var(--tier-gold))]",
  "company-penetration": "text-blue-400",
  "stale-followup": "text-amber-400",
  "cluster-gap": "text-red-400",
};

export function SuggestedActions({ actions }: SuggestedActionsProps) {
  if (actions.length === 0) {
    return (
      <Card className="col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">
            Suggested Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No suggested actions at this time. Data looks good.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">
          Suggested Actions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0">
        {actions.map((action, idx) => {
          const Icon = typeIcons[action.type] || AlertTriangle;
          const color = typeColors[action.type] || "text-muted-foreground";

          return (
            <div
              key={`${action.type}-${idx}`}
              className={cn(
                "flex items-start gap-3 rounded-md px-2 py-2.5 -mx-2",
                "hover:bg-accent/50 transition-colors"
              )}
            >
              <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", color)} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug">
                  {action.title}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                  {action.description}
                </p>
              </div>
              <Link
                href={action.href}
                className="shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
