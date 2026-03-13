"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Network,
  Users,
  Target,
  GitBranch,
  Play,
  ClipboardList,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RateBudgetMeter } from "@/components/layout/rate-budget-meter";

interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
}

const primaryNav: NavItem[] = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Network", href: "/network", icon: Network },
  { title: "Contacts", href: "/contacts", icon: Users },
  { title: "ICP & Niches", href: "/icp", icon: Target },
  { title: "Outreach", href: "/outreach", icon: GitBranch },
];

const systemNav: NavItem[] = [
  { title: "Actions", href: "/actions", icon: Play },
  { title: "Operations", href: "/operations", icon: ClipboardList },
  { title: "Configuration", href: "/config", icon: Settings },
];

interface SidebarNavProps {
  collapsed: boolean;
}

export function SidebarNav({ collapsed }: SidebarNavProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Logo / Brand */}
      <div className="flex h-14 items-center border-b border-border px-3">
        {collapsed ? (
          <div className="flex w-full items-center justify-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-bold">
              NI
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-bold">
              NI
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold leading-none">Network</span>
              <span className="text-[10px] text-muted-foreground leading-none mt-0.5">
                Intelligence
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 py-2">
        <nav className="space-y-0.5 px-2">
          {primaryNav.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(item.href)}
              collapsed={collapsed}
            />
          ))}
        </nav>

        <div className="px-3 py-2">
          <Separator />
        </div>

        <nav className="space-y-0.5 px-2">
          {systemNav.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(item.href)}
              collapsed={collapsed}
            />
          ))}
        </nav>
      </ScrollArea>

      {/* Footer: Rate Budget */}
      <div className="border-t border-border">
        {collapsed ? (
          <div className="flex items-center justify-center py-3">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
          </div>
        ) : (
          <RateBudgetMeter />
        )}
      </div>
    </div>
  );
}

function NavLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={cn(
        "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        active
          ? "border-l-2 border-primary bg-accent text-accent-foreground"
          : "border-l-2 border-transparent text-muted-foreground",
        collapsed && "justify-center px-2"
      )}
      title={collapsed ? item.title : undefined}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{item.title}</span>
          {item.badge && (
            <Badge
              variant="secondary"
              className="ml-auto h-5 px-1.5 text-[10px] font-normal tabular-nums"
            >
              {item.badge}
            </Badge>
          )}
        </>
      )}
    </Link>
  );
}
