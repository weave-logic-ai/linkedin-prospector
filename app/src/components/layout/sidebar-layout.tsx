"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { Header } from "@/components/layout/header";

const SIDEBAR_WIDTH = 256;
const SIDEBAR_COLLAPSED_WIDTH = 64;
const STORAGE_KEY = "sidebar-collapsed";

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "true") {
      setCollapsed(true);
    }
    setMounted(true);
  }, []);

  const handleToggle = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex flex-col border-r border-border bg-card",
          "transition-[width] duration-200 ease-in-out",
          !mounted && "opacity-0"
        )}
        style={{ width: sidebarWidth }}
      >
        <SidebarNav collapsed={collapsed} />
      </aside>

      {/* Main content area */}
      <div
        className={cn(
          "flex flex-1 flex-col transition-[margin-left] duration-200 ease-in-out",
          !mounted && "opacity-0"
        )}
        style={{ marginLeft: sidebarWidth }}
      >
        <Header collapsed={collapsed} onToggleCollapse={handleToggle} />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
