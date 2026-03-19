"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Command as CommandPrimitive } from "cmdk";
import { Badge } from "@/components/ui/badge";
import {
  Home,
  Users,
  Share2,
  Compass,
  Database,
  Send,
  CheckSquare,
  Upload,
  Settings,
  Search,
  Zap,
  BarChart3,
} from "lucide-react";

interface ContactResult {
  id: string;
  name: string;
  company: string | null;
  tier: string | null;
}

const TIER_STYLES: Record<string, string> = {
  gold: "bg-yellow-500/20 text-yellow-600 border-yellow-500/30",
  silver: "bg-slate-400/20 text-slate-500 border-slate-400/30",
  bronze: "bg-amber-600/20 text-amber-700 border-amber-600/30",
  watch: "bg-gray-500/20 text-gray-600 border-gray-500/30",
};

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: Home },
  { label: "Contacts", href: "/contacts", icon: Users },
  { label: "Network", href: "/network", icon: Share2 },
  { label: "Discover", href: "/discover", icon: Compass },
  { label: "Enrichment", href: "/enrichment", icon: Database },
  { label: "Outreach", href: "/outreach", icon: Send },
  { label: "Tasks", href: "/tasks", icon: CheckSquare },
  { label: "Import", href: "/import", icon: Upload },
  { label: "Admin", href: "/admin", icon: Settings },
];

const ACTION_ITEMS = [
  {
    label: "Import Data",
    action: "/import",
    icon: Upload,
    keywords: ["upload", "csv"],
  },
  {
    label: "Compute Scores",
    action: "/api/contacts/scores/compute",
    icon: BarChart3,
    keywords: ["calculate", "ranking"],
    isApiAction: true,
  },
  {
    label: "Compute Graph",
    action: "/api/graph/compute",
    icon: Zap,
    keywords: ["network", "clusters"],
    isApiAction: true,
  },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [contacts, setContacts] = useState<ContactResult[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const router = useRouter();
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const searchContacts = useCallback(async (query: string) => {
    if (query.length < 2) {
      setContacts([]);
      return;
    }
    setContactsLoading(true);
    try {
      const res = await fetch(
        `/api/contacts/search?q=${encodeURIComponent(query)}`
      );
      if (res.ok) {
        const json = await res.json();
        setContacts(json.data || json.contacts || []);
      }
    } catch {
      // Silently handle search errors
    } finally {
      setContactsLoading(false);
    }
  }, []);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        searchContacts(value);
      }, 300);
    },
    [searchContacts]
  );

  const handleClose = useCallback(() => {
    setOpen(false);
    setSearch("");
    setContacts([]);
  }, []);

  const handleNavSelect = useCallback(
    (href: string) => {
      router.push(href);
      handleClose();
    },
    [router, handleClose]
  );

  const handleActionSelect = useCallback(
    async (item: (typeof ACTION_ITEMS)[number]) => {
      if (item.isApiAction) {
        try {
          await fetch(item.action, { method: "POST" });
        } catch {
          // Silently handle action errors
        }
      } else {
        router.push(item.action);
      }
      handleClose();
    },
    [router, handleClose]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />
      <div className="fixed left-1/2 top-[20%] z-50 w-full max-w-lg -translate-x-1/2">
        <CommandPrimitive
          className="rounded-xl border bg-popover text-popover-foreground shadow-2xl"
          shouldFilter={true}
          loop
        >
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <CommandPrimitive.Input
              placeholder="Search contacts, pages, actions..."
              className="flex h-12 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              value={search}
              onValueChange={handleSearchChange}
            />
            <kbd className="pointer-events-none ml-2 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
              ESC
            </kbd>
          </div>

          <CommandPrimitive.List className="max-h-80 overflow-y-auto p-2">
            <CommandPrimitive.Empty className="py-6 text-center text-sm text-muted-foreground">
              No results found.
            </CommandPrimitive.Empty>

            {contacts.length > 0 && (
              <CommandPrimitive.Group heading="Contacts">
                {contacts.map((contact) => (
                  <CommandPrimitive.Item
                    key={contact.id}
                    value={`contact-${contact.name}`}
                    onSelect={() =>
                      handleNavSelect(`/contacts/${contact.id}`)
                    }
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm aria-selected:bg-accent"
                  >
                    <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex flex-1 items-center justify-between min-w-0">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{contact.name}</p>
                        {contact.company && (
                          <p className="text-xs text-muted-foreground truncate">
                            {contact.company}
                          </p>
                        )}
                      </div>
                      {contact.tier && (
                        <Badge
                          variant="outline"
                          className={`ml-2 shrink-0 text-[10px] ${TIER_STYLES[contact.tier] || ""}`}
                        >
                          {contact.tier}
                        </Badge>
                      )}
                    </div>
                  </CommandPrimitive.Item>
                ))}
              </CommandPrimitive.Group>
            )}

            {contactsLoading && (
              <div className="py-2 text-center text-xs text-muted-foreground">
                Searching...
              </div>
            )}

            <CommandPrimitive.Group heading="Navigation">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandPrimitive.Item
                    key={item.href}
                    value={item.label}
                    onSelect={() => handleNavSelect(item.href)}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm aria-selected:bg-accent"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>{item.label}</span>
                  </CommandPrimitive.Item>
                );
              })}
            </CommandPrimitive.Group>

            <CommandPrimitive.Group heading="Actions">
              {ACTION_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandPrimitive.Item
                    key={item.label}
                    value={item.label}
                    keywords={item.keywords}
                    onSelect={() => handleActionSelect(item)}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm aria-selected:bg-accent"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>{item.label}</span>
                  </CommandPrimitive.Item>
                );
              })}
            </CommandPrimitive.Group>
          </CommandPrimitive.List>
        </CommandPrimitive>
      </div>
    </div>
  );
}
