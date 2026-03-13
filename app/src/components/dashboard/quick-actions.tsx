"use client";

import Link from "next/link";
import {
  RefreshCw,
  FileBarChart,
  Download,
  Gauge,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

interface QuickAction {
  label: string;
  description: string;
  icon: React.ElementType;
  href: string;
}

const quickActions: QuickAction[] = [
  {
    label: "Rescore All",
    description: "Re-run gold scoring on entire network",
    icon: RefreshCw,
    href: "/actions/rescore",
  },
  {
    label: "Generate Reports",
    description: "Build network & outreach reports",
    icon: FileBarChart,
    href: "/actions/reports",
  },
  {
    label: "Export Gold CSV",
    description: "Download top contacts as CSV",
    icon: Download,
    href: "/actions/export?tier=gold",
  },
  {
    label: "Check Budget",
    description: "View remaining API rate budget",
    icon: Gauge,
    href: "/config",
  },
];

export function QuickActions() {
  return (
    <Card className="col-span-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.label}
                href={action.href}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "h-9 gap-2"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {action.label}
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
