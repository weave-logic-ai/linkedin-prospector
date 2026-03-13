"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface GoldContact {
  id: string;
  name: string;
  title: string;
  company: string;
  goldScore: number;
  icpFit: number;
  tier: string;
  topCluster: string;
}

interface GoldContactsCardProps {
  contacts: GoldContact[];
}

export function GoldContactsCard({ contacts }: GoldContactsCardProps) {
  if (contacts.length === 0) {
    return (
      <Card className="col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">
            Top Gold Contacts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No gold contacts found. Run scoring to identify high-value contacts.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">
          Top Gold Contacts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0">
        {contacts.map((contact) => (
          <Link
            key={contact.id}
            href={`/contacts/${contact.id}`}
            className={cn(
              "flex items-center gap-3 rounded-md px-2 py-2.5 -mx-2",
              "hover:bg-accent/50 transition-colors"
            )}
          >
            {/* Name + Title */}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{contact.name}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {contact.title}
                {contact.company && (
                  <span className="text-muted-foreground/60">
                    {" "}
                    @ {contact.company}
                  </span>
                )}
              </p>
            </div>

            {/* Cluster tag */}
            {contact.topCluster && (
              <span className="hidden sm:inline text-[10px] text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded">
                {contact.topCluster}
              </span>
            )}

            {/* Gold Score badge */}
            <Badge variant="gold" className="shrink-0 tabular-nums">
              {(contact.goldScore * 100).toFixed(0)}
            </Badge>

            {/* ICP Fit bar */}
            <div className="w-16 shrink-0 space-y-0.5">
              <Progress
                value={contact.icpFit * 100}
                className="h-1.5"
                indicatorClassName={cn(
                  contact.icpFit >= 0.7
                    ? "bg-emerald-500"
                    : contact.icpFit >= 0.4
                      ? "bg-amber-500"
                      : "bg-red-400"
                )}
              />
              <p className="text-[9px] text-muted-foreground/50 text-center tabular-nums">
                ICP {(contact.icpFit * 100).toFixed(0)}%
              </p>
            </div>
          </Link>
        ))}

        {/* Footer link */}
        <div className="pt-2 border-t mt-1">
          <Link
            href="/contacts?tier=gold"
            className="text-xs text-primary hover:underline"
          >
            View all gold contacts &rarr;
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
