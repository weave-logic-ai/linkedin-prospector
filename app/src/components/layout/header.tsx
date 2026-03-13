"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { ChevronRight, PanelLeftClose, PanelLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const routeLabels: Record<string, string> = {
  "/": "Dashboard",
  "/network": "Network",
  "/contacts": "Contacts",
  "/icp": "ICP & Niches",
  "/outreach": "Outreach Pipeline",
  "/actions": "Actions",
  "/config": "Configuration",
};

interface HeaderProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function Header({ collapsed, onToggleCollapse }: HeaderProps) {
  const pathname = usePathname();

  const breadcrumbs = React.useMemo(() => {
    if (pathname === "/") {
      return [{ label: "Dashboard", href: "/" }];
    }

    const segments = pathname.split("/").filter(Boolean);
    const crumbs = [{ label: "Home", href: "/" }];

    let currentPath = "";
    for (const segment of segments) {
      currentPath += `/${segment}`;
      const label =
        routeLabels[currentPath] ||
        segment.charAt(0).toUpperCase() + segment.slice(1);
      crumbs.push({ label, href: currentPath });
    }

    return crumbs;
  }, [pathname]);

  return (
    <header className="flex h-14 items-center border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {/* Sidebar toggle */}
        <button
          onClick={onToggleCollapse}
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-md",
            "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            "transition-colors shrink-0"
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>

        {/* Breadcrumbs */}
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1 text-sm min-w-0"
        >
          {breadcrumbs.map((crumb, index) => (
            <React.Fragment key={crumb.href}>
              {index > 0 && (
                <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
              )}
              <span
                className={cn(
                  "truncate",
                  index === breadcrumbs.length - 1
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {crumb.label}
              </span>
            </React.Fragment>
          ))}
        </nav>
      </div>

      {/* Right side actions */}
      <div className="flex items-center gap-1 shrink-0">
        <ThemeToggle />
      </div>
    </header>
  );
}
