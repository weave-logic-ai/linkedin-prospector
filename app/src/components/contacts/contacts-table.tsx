"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { ArrowUpDown, ArrowUp, ArrowDown, MapPin, Briefcase, Building2, Users } from "lucide-react";
import { OutreachCell } from "@/components/contacts/outreach-cell";
import { InvestigateCell } from "@/components/contacts/investigate-cell";
import { ExploreCell } from "@/components/contacts/explore-cell";

interface Contact {
  id: string;
  name: string;
  title: string;
  company: string;
  goldScore: number;
  icpFit: number;
  networkHub: number;
  behavioralScore: number;
  tier: string;
  persona: string;
  degree: number;
  mutualConnections: number;
  location: string;
  profileUrl: string;
  outreachState: string | null;
  noteCount: number;
  deepScanned: boolean;
  deepScannedAt: string | null;
  deepScanResults: number;
}

interface ContactsTableProps {
  contacts: Contact[];
  sort: string;
  order: string;
  onSort: (field: string) => void;
}

const TIER_VARIANT: Record<string, "gold" | "silver" | "bronze" | "watch"> = {
  gold: "gold",
  silver: "silver",
  bronze: "bronze",
  watch: "watch",
};

const TIER_DESCRIPTIONS: Record<string, string> = {
  gold: "Top prospect -- high ICP fit, strong network position. Prioritize outreach.",
  silver: "Promising contact -- moderate ICP fit or good network position. Worth nurturing.",
  bronze: "Potential contact -- some relevant signals. Monitor for opportunities.",
  watch: "Low priority -- limited ICP fit. May become relevant with score changes.",
};

function scoreColor(score: number): string {
  if (score >= 0.7) return "text-emerald-500";
  if (score >= 0.5) return "text-amber-400";
  if (score >= 0.3) return "text-orange-400";
  return "text-red-400";
}

function scoreBar(score: number): string {
  const pct = Math.round(score * 100);
  if (score >= 0.7) return `linear-gradient(90deg, hsl(142 71% 45%) ${pct}%, transparent ${pct}%)`;
  if (score >= 0.5) return `linear-gradient(90deg, hsl(38 92% 50%) ${pct}%, transparent ${pct}%)`;
  if (score >= 0.3) return `linear-gradient(90deg, hsl(25 95% 53%) ${pct}%, transparent ${pct}%)`;
  return `linear-gradient(90deg, hsl(0 72% 51%) ${pct}%, transparent ${pct}%)`;
}

function SortIcon({ field, currentSort, order }: { field: string; currentSort: string; order: string }) {
  if (field !== currentSort) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
  return order === "asc" ? (
    <ArrowUp className="h-3 w-3 ml-1" />
  ) : (
    <ArrowDown className="h-3 w-3 ml-1" />
  );
}

const COLUMNS = [
  { key: "name", label: "Name", sortable: true },
  { key: "title", label: "Title", sortable: false },
  { key: "company", label: "Company", sortable: true },
  { key: "goldScore", label: "Gold", sortable: true },
  { key: "icpFit", label: "ICP", sortable: true },
  { key: "tier", label: "Tier", sortable: true },
  { key: "networkHub", label: "Hub", sortable: true },
  { key: "degree", label: "Deg", sortable: true },
  { key: "outreach", label: "Outreach", sortable: false },
  { key: "investigate", label: "Investigate", sortable: false },
  { key: "explore", label: "Explore", sortable: false },
] as const;

export function ContactsTable({ contacts, sort, order, onSort }: ContactsTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {COLUMNS.map((col) => (
            <TableHead
              key={col.key}
              className={col.sortable ? "cursor-pointer select-none" : ""}
              onClick={() => col.sortable && onSort(col.key)}
            >
              <span className="inline-flex items-center">
                {col.label}
                {col.sortable && (
                  <SortIcon field={col.key} currentSort={sort} order={order} />
                )}
              </span>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {contacts.length === 0 ? (
          <TableRow>
            <TableCell colSpan={COLUMNS.length} className="text-center py-8 text-muted-foreground">
              No contacts found matching your filters.
            </TableCell>
          </TableRow>
        ) : (
          contacts.map((contact) => (
            <TableRow key={contact.id} className="group">
              {/* Name cell with rich HoverCard */}
              <TableCell className="font-medium max-w-[180px]">
                <HoverCard>
                  <HoverCardTrigger asChild>
                    <Link href={`/contacts/${contact.id}`} className="hover:underline text-foreground">
                      {contact.name}
                    </Link>
                  </HoverCardTrigger>
                  <HoverCardContent side="bottom" align="start" className="w-72">
                    <div className="space-y-2">
                      <div>
                        <div className="text-sm font-semibold">{contact.name}</div>
                        <div className="text-xs text-muted-foreground">{contact.title}</div>
                        {contact.company && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Building2 className="h-3 w-3" />
                            {contact.company}
                          </div>
                        )}
                        {contact.location && (
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
                            <MapPin className="h-2.5 w-2.5" />
                            {contact.location}
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                        <div className="flex items-center justify-between rounded bg-muted/50 px-2 py-1">
                          <span className="text-muted-foreground">Gold</span>
                          <span className={`font-semibold ${scoreColor(contact.goldScore)}`}>{(contact.goldScore * 100).toFixed(0)}</span>
                        </div>
                        <div className="flex items-center justify-between rounded bg-muted/50 px-2 py-1">
                          <span className="text-muted-foreground">ICP</span>
                          <span className={`font-semibold ${scoreColor(contact.icpFit)}`}>{(contact.icpFit * 100).toFixed(0)}</span>
                        </div>
                        <div className="flex items-center justify-between rounded bg-muted/50 px-2 py-1">
                          <span className="text-muted-foreground">Hub</span>
                          <span className={`font-semibold ${scoreColor(contact.networkHub)}`}>{(contact.networkHub * 100).toFixed(0)}</span>
                        </div>
                        <div className="flex items-center justify-between rounded bg-muted/50 px-2 py-1">
                          <span className="text-muted-foreground">Behavioral</span>
                          <span className={`font-semibold ${scoreColor(contact.behavioralScore)}`}>{(contact.behavioralScore * 100).toFixed(0)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={TIER_VARIANT[contact.tier] || "outline"}>{contact.tier}</Badge>
                        <span className="text-[10px] text-muted-foreground">{contact.degree === 1 ? "1st degree" : "2nd degree"}</span>
                        {contact.mutualConnections > 0 && (
                          <span className="text-[10px] text-muted-foreground">{contact.mutualConnections} mutual</span>
                        )}
                      </div>
                    </div>
                  </HoverCardContent>
                </HoverCard>
              </TableCell>

              {/* Title cell with HoverCard */}
              <TableCell className="max-w-[220px] truncate text-muted-foreground text-xs">
                <HoverCard>
                  <HoverCardTrigger>
                    <span className="cursor-default">{contact.title}</span>
                  </HoverCardTrigger>
                  <HoverCardContent side="bottom" align="start" className="w-64">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-medium">
                        <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                        {contact.title}
                      </div>
                      {contact.company && (
                        <div className="text-[10px] text-muted-foreground">at {contact.company}</div>
                      )}
                      {contact.persona && (
                        <div className="text-[10px] text-muted-foreground/70">
                          Persona: {contact.persona}
                        </div>
                      )}
                    </div>
                  </HoverCardContent>
                </HoverCard>
              </TableCell>

              {/* Company cell with HoverCard */}
              <TableCell className="max-w-[150px] truncate text-xs">
                <HoverCard>
                  <HoverCardTrigger>
                    <span className="cursor-default">{contact.company}</span>
                  </HoverCardTrigger>
                  <HoverCardContent side="bottom" align="start" className="w-56">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-medium">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                        {contact.company}
                      </div>
                      {contact.location && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <MapPin className="h-2.5 w-2.5" />
                          {contact.location}
                        </div>
                      )}
                    </div>
                  </HoverCardContent>
                </HoverCard>
              </TableCell>

              {/* Gold Score cell with breakdown HoverCard */}
              <TableCell>
                <HoverCard>
                  <HoverCardTrigger>
                    <div className="flex items-center gap-2 min-w-[90px] cursor-default">
                      <span className={`font-mono text-xs font-semibold ${scoreColor(contact.goldScore)}`}>
                        {(contact.goldScore * 100).toFixed(0)}
                      </span>
                      <div
                        className="h-1.5 w-12 rounded-full opacity-60"
                        style={{ background: scoreBar(contact.goldScore) }}
                      />
                    </div>
                  </HoverCardTrigger>
                  <HoverCardContent side="bottom" className="w-56">
                    <div className="space-y-1.5">
                      <div className="text-xs font-medium">Gold Score Breakdown</div>
                      <div className="space-y-1">
                        {[
                          { label: "ICP Fit", value: contact.icpFit },
                          { label: "Network Hub", value: contact.networkHub },
                          { label: "Behavioral", value: contact.behavioralScore },
                        ].map(({ label, value }) => (
                          <div key={label} className="flex items-center justify-between text-[10px]">
                            <span className="text-muted-foreground">{label}</span>
                            <div className="flex items-center gap-1.5">
                              <div className="h-1 w-16 rounded-full bg-muted overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${value * 100}%`, background: scoreBar(value) }} />
                              </div>
                              <span className={`font-mono font-semibold w-6 text-right ${scoreColor(value)}`}>{(value * 100).toFixed(0)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </HoverCardContent>
                </HoverCard>
              </TableCell>

              {/* ICP cell with HoverCard */}
              <TableCell>
                <HoverCard>
                  <HoverCardTrigger>
                    <span className={`font-mono text-xs cursor-default ${scoreColor(contact.icpFit)}`}>
                      {(contact.icpFit * 100).toFixed(0)}
                    </span>
                  </HoverCardTrigger>
                  <HoverCardContent side="bottom" className="w-52">
                    <div className="space-y-1">
                      <div className="text-xs font-medium">ICP Fit Score</div>
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${contact.icpFit * 100}%`, background: scoreBar(contact.icpFit) }} />
                        </div>
                        <span className={`font-mono text-xs font-semibold ${scoreColor(contact.icpFit)}`}>{(contact.icpFit * 100).toFixed(0)}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        How well this contact matches your Ideal Customer Profile based on role, industry, and seniority.
                      </div>
                    </div>
                  </HoverCardContent>
                </HoverCard>
              </TableCell>

              {/* Tier cell with HoverCard */}
              <TableCell>
                <HoverCard>
                  <HoverCardTrigger>
                    <Badge variant={TIER_VARIANT[contact.tier] || "outline"}>{contact.tier}</Badge>
                  </HoverCardTrigger>
                  <HoverCardContent side="bottom" className="w-52">
                    <div className="text-[10px] text-muted-foreground">
                      {TIER_DESCRIPTIONS[contact.tier] || "Tier classification based on combined scoring signals."}
                    </div>
                  </HoverCardContent>
                </HoverCard>
              </TableCell>

              {/* Hub cell with HoverCard */}
              <TableCell>
                <HoverCard>
                  <HoverCardTrigger>
                    <span className={`font-mono text-xs cursor-default ${scoreColor(contact.networkHub)}`}>
                      {(contact.networkHub * 100).toFixed(0)}
                    </span>
                  </HoverCardTrigger>
                  <HoverCardContent side="bottom" className="w-52">
                    <div className="space-y-1">
                      <div className="text-xs font-medium">Network Hub Score</div>
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${contact.networkHub * 100}%`, background: scoreBar(contact.networkHub) }} />
                        </div>
                        <span className={`font-mono text-xs font-semibold ${scoreColor(contact.networkHub)}`}>{(contact.networkHub * 100).toFixed(0)}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Measures how central this person is in the network. Higher scores mean more connections to other valuable contacts.
                      </div>
                    </div>
                  </HoverCardContent>
                </HoverCard>
              </TableCell>

              {/* Degree cell with HoverCard */}
              <TableCell>
                <HoverCard>
                  <HoverCardTrigger>
                    <span className="text-xs text-muted-foreground cursor-default">
                      {contact.degree === 1 ? "1st" : "2nd"}
                    </span>
                  </HoverCardTrigger>
                  <HoverCardContent side="bottom" className="w-52">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-medium">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        {contact.degree === 1 ? "1st-Degree Connection" : "2nd-Degree Connection"}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {contact.degree === 1
                          ? "Direct connection in your network. You can message them directly."
                          : "Connected through a mutual contact. Requires an introduction or connection request."}
                      </div>
                      {contact.mutualConnections > 0 && (
                        <div className="text-[10px] text-muted-foreground/80">
                          {contact.mutualConnections} mutual connection{contact.mutualConnections !== 1 ? "s" : ""}
                        </div>
                      )}
                    </div>
                  </HoverCardContent>
                </HoverCard>
              </TableCell>

              {/* Outreach */}
              <TableCell>
                <OutreachCell
                  contactId={contact.id}
                  state={contact.outreachState}
                  noteCount={contact.noteCount}
                />
              </TableCell>
              {/* Investigate */}
              <TableCell>
                <InvestigateCell
                  contactId={contact.id}
                  profileUrl={contact.profileUrl}
                  deepScanned={contact.deepScanned}
                  deepScannedAt={contact.deepScannedAt}
                  deepScanResults={contact.deepScanResults}
                />
              </TableCell>
              {/* Explore */}
              <TableCell>
                <ExploreCell
                  contactId={contact.id}
                  profileUrl={contact.profileUrl}
                  degree={contact.degree}
                  deepScanned={contact.deepScanned}
                  deepScanResults={contact.deepScanResults}
                />
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
