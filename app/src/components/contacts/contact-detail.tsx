"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreBars } from "@/components/contacts/score-bars";
import {
  ArrowLeft,
  ExternalLink,
  Building2,
  MapPin,
  Users,
  Link2,
  Send,
  Clock,
  MessageSquare,
  UserCheck,
  Star,
  X,
  Pause,
  XCircle,
  PenLine,
  Loader2,
} from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const TIER_VARIANT: Record<string, "gold" | "silver" | "bronze" | "watch"> = {
  gold: "gold",
  silver: "silver",
  bronze: "bronze",
  watch: "watch",
};

interface ContactDetailProps {
  slug: string;
}

export function ContactDetail({ slug }: ContactDetailProps) {
  const { data, isLoading, error } = useSWR(`/api/contacts/${slug}`, fetcher);
  const { data: similarData } = useSWR(
    `/api/contacts/${slug}/similar`,
    fetcher
  );
  const { data: outreachData, mutate: mutateOutreach } = useSWR(
    `/api/contacts/${slug}/outreach`,
    fetcher
  );
  const { data: notesData, mutate: mutateNotes } = useSWR(
    `/api/contacts/${slug}/notes`,
    fetcher
  );

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-destructive mb-4">Contact not found or data unavailable.</p>
        <Link href="/contacts">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Contacts
          </Button>
        </Link>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  const { contact, edges, companyContacts } = data;

  const scores = [
    { label: "ICP Fit", value: contact.icpFit },
    { label: "Network Hub", value: contact.networkHub },
    { label: "Relationship Strength", value: contact.relationshipStrength },
    { label: "Signal Boost", value: contact.signalBoost },
    { label: "Skills Relevance", value: contact.skillsRelevance },
    { label: "Behavioral", value: contact.behavioralScore },
    { label: "Network Proximity", value: contact.networkProximity },
  ];

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/contacts"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Contacts
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{contact.name}</h1>
            <Badge variant={TIER_VARIANT[contact.tier] || "outline"}>
              {contact.tier}
            </Badge>
            {contact.degree && (
              <Badge variant="outline">
                {contact.degree === 1 ? "1st" : "2nd"} degree
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">{contact.title}</p>
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {contact.company && (
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" />
                {contact.company}
              </span>
            )}
            {contact.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {contact.location}
              </span>
            )}
            {contact.mutualConnections > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                {contact.mutualConnections} mutual
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <a
            href={contact.profileUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              LinkedIn
            </Button>
          </a>
        </div>
      </div>

      {/* Gold Score Highlight */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold font-mono tabular-nums">
              {Math.round(contact.goldScore * 100)}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">Gold Score</div>
          </div>
          <div className="h-12 w-px bg-border" />
          <div className="flex flex-wrap gap-4 text-sm">
            {contact.persona && (
              <div>
                <span className="text-muted-foreground">Persona: </span>
                <span className="font-medium">{contact.persona}</span>
              </div>
            )}
            {contact.behavioralPersona && (
              <div>
                <span className="text-muted-foreground">Behavioral: </span>
                <span className="font-medium">{contact.behavioralPersona}</span>
              </div>
            )}
            {contact.referralTier && (
              <div>
                <span className="text-muted-foreground">Referral: </span>
                <span className="font-medium">{contact.referralTier}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Outreach & Notes */}
      <OutreachSection
        slug={slug}
        outreachData={outreachData}
        notesData={notesData}
        mutateOutreach={mutateOutreach}
        mutateNotes={mutateNotes}
      />

      {/* Main grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Scores */}
        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold mb-4">Score Breakdown</h2>
          <ScoreBars scores={scores} />
        </div>

        {/* About / Headline */}
        <div className="space-y-4">
          {contact.headline && (
            <div className="rounded-lg border bg-card p-4">
              <h2 className="text-sm font-semibold mb-2">Headline</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {contact.headline}
              </p>
            </div>
          )}
          {contact.about && (
            <div className="rounded-lg border bg-card p-4">
              <h2 className="text-sm font-semibold mb-2">About</h2>
              <p className="text-sm text-muted-foreground leading-relaxed line-clamp-6">
                {contact.about}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Tags & Clusters */}
      {contact.tags && contact.tags.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3">Tags</h2>
          <div className="flex flex-wrap gap-1.5">
            {contact.tags.map((tag: string) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Account Penetration */}
      {contact.accountPenetration && (
        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3">Account Penetration</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-sm">
            <div>
              <div className="text-muted-foreground">Company</div>
              <div className="font-medium">{contact.accountPenetration.company}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Score</div>
              <div className="font-mono font-medium">
                {Math.round(contact.accountPenetration.score * 100)}%
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Contacts</div>
              <div className="font-medium">{contact.accountPenetration.contactCount}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Avg Gold</div>
              <div className="font-mono font-medium">
                {Math.round(contact.accountPenetration.avgGoldScore * 100)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Connections */}
      {edges && edges.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3">
            Top Connections ({edges.length})
          </h2>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {edges.map(
              (edge: {
                targetId: string;
                targetName: string;
                type: string;
                weight: number;
              }) => (
                <Link
                  key={edge.targetId}
                  href={`/contacts/${edge.targetId}`}
                  className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Link2 className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="truncate">{edge.targetName}</span>
                  </div>
                  <Badge variant="outline" className="ml-2 shrink-0 text-xs">
                    {edge.type}
                  </Badge>
                </Link>
              )
            )}
          </div>
        </div>
      )}

      {/* Company Contacts */}
      {companyContacts && companyContacts.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3">
            Same Company ({companyContacts.length})
          </h2>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {companyContacts.map(
              (cc: {
                id: string;
                name: string;
                title: string;
                goldScore: number;
                tier: string;
              }) => (
                <Link
                  key={cc.id}
                  href={`/contacts/${cc.id}`}
                  className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted transition-colors"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{cc.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {cc.title}
                    </div>
                  </div>
                  <Badge
                    variant={TIER_VARIANT[cc.tier] || "outline"}
                    className="ml-2 shrink-0"
                  >
                    {Math.round(cc.goldScore * 100)}
                  </Badge>
                </Link>
              )
            )}
          </div>
        </div>
      )}

      {/* Similar Contacts */}
      {similarData?.similar && similarData.similar.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3">Similar Contacts</h2>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {similarData.similar.map(
              (s: {
                id: string;
                name: string;
                title: string;
                company: string;
                goldScore: number;
                tier: string;
              }) => (
                <Link
                  key={s.id}
                  href={`/contacts/${s.id}`}
                  className="rounded-md border p-3 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm truncate">{s.name}</span>
                    <Badge
                      variant={TIER_VARIANT[s.tier] || "outline"}
                      className="ml-2 shrink-0"
                    >
                      {s.tier}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {s.title}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {s.company}
                  </div>
                  <div className="text-xs font-mono mt-1">
                    Gold: {Math.round(s.goldScore * 100)}
                  </div>
                </Link>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const OUTREACH_STYLES: Record<string, { bg: string; text: string; label: string; icon: typeof Clock }> = {
  planned: { bg: "bg-blue-500/15", text: "text-blue-500", label: "Planned", icon: Clock },
  sent: { bg: "bg-sky-500/15", text: "text-sky-500", label: "Sent", icon: Send },
  pending_response: { bg: "bg-amber-500/15", text: "text-amber-500", label: "Pending Response", icon: Clock },
  responded: { bg: "bg-emerald-500/15", text: "text-emerald-500", label: "Responded", icon: MessageSquare },
  engaged: { bg: "bg-green-500/15", text: "text-green-500", label: "Engaged", icon: UserCheck },
  converted: { bg: "bg-emerald-600/15", text: "text-emerald-600", label: "Converted", icon: Star },
  declined: { bg: "bg-red-400/15", text: "text-red-400", label: "Declined", icon: X },
  deferred: { bg: "bg-gray-400/15", text: "text-gray-400", label: "Deferred", icon: Pause },
  closed_lost: { bg: "bg-gray-600/15", text: "text-gray-600", label: "Lost", icon: XCircle },
};

interface OutreachSectionProps {
  slug: string;
  outreachData: { state: string | null; history: { from: string; to: string; timestamp: string; note: string | null }[]; validTransitions: string[] } | undefined;
  notesData: { notes: { text: string; timestamp: string; state: string | null }[] } | undefined;
  mutateOutreach: () => void;
  mutateNotes: () => void;
}

function OutreachSection({ slug, outreachData, notesData, mutateOutreach, mutateNotes }: OutreachSectionProps) {
  const [transitioning, setTransitioning] = React.useState(false);
  const [transitionNote, setTransitionNote] = React.useState("");
  const [newNote, setNewNote] = React.useState("");
  const [savingNote, setSavingNote] = React.useState(false);

  const currentState = outreachData?.state || null;
  const transitions = outreachData?.validTransitions || [];
  const history = outreachData?.history || [];
  const notes = notesData?.notes || [];
  const style = currentState ? OUTREACH_STYLES[currentState] : null;

  async function transitionTo(newState: string) {
    setTransitioning(true);
    try {
      const res = await fetch(`/api/contacts/${slug}/outreach`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: newState, note: transitionNote || null }),
      });
      if (res.ok) {
        setTransitionNote("");
        mutateOutreach();
      }
    } finally {
      setTransitioning(false);
    }
  }

  async function addNote() {
    if (!newNote.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/contacts/${slug}/notes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: newNote.trim(), state: currentState }),
      });
      if (res.ok) {
        setNewNote("");
        mutateNotes();
      }
    } finally {
      setSavingNote(false);
    }
  }

  function formatTime(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <h2 className="text-sm font-semibold">Outreach & Notes</h2>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Left: State + Transitions */}
        <div className="space-y-3">
          {/* Current state badge */}
          <div className="flex items-center gap-3">
            {style ? (
              <div className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold ${style.bg} ${style.text}`}>
                <style.icon className="h-4 w-4" />
                {style.label}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No outreach started</div>
            )}
          </div>

          {/* Transition buttons */}
          {transitions.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">
                {currentState ? "Move to:" : "Start outreach:"}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {transitions.map((t) => {
                  const ts = OUTREACH_STYLES[t];
                  const TIcon = ts?.icon || Clock;
                  return (
                    <button
                      key={t}
                      onClick={() => transitionTo(t)}
                      disabled={transitioning}
                      className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50 ${ts?.text || ""}`}
                    >
                      <TIcon className="h-3 w-3" />
                      {ts?.label || t}
                    </button>
                  );
                })}
              </div>
              <input
                value={transitionNote}
                onChange={(e) => setTransitionNote(e.target.value)}
                placeholder="Note with transition (optional)..."
                className="w-full rounded-md border bg-background px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          )}

          {/* Timeline */}
          {history.length > 0 && (
            <div className="pt-2 border-t">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Timeline</div>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {history.map((h, i) => {
                  const toStyle = OUTREACH_STYLES[h.to];
                  return (
                    <div key={i} className="flex gap-2 text-xs">
                      <div className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${toStyle?.text?.replace("text-", "bg-") || "bg-gray-400"}`} />
                      <div>
                        <span className="text-muted-foreground">{OUTREACH_STYLES[h.from]?.label || h.from}</span>
                        {" → "}
                        <span className={toStyle?.text || ""}>{toStyle?.label || h.to}</span>
                        <span className="text-muted-foreground/60 ml-2">{formatTime(h.timestamp)}</span>
                        {h.note && (
                          <div className="text-[11px] text-foreground/70 bg-muted/50 rounded px-2 py-0.5 mt-0.5">{h.note}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: Notes */}
        <div className="space-y-3">
          <div className="text-xs font-medium text-muted-foreground">Notes ({notes.length})</div>

          {/* Add note */}
          <div className="flex gap-1.5">
            <input
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addNote(); } }}
              placeholder="Add a note..."
              className="flex-1 rounded-md border bg-background px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              onClick={addNote}
              disabled={savingNote || !newNote.trim()}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {savingNote ? <Loader2 className="h-3 w-3 animate-spin" /> : <><PenLine className="h-3 w-3" /> Save</>}
            </button>
          </div>

          {/* Notes list */}
          {notes.length > 0 ? (
            <div className="space-y-1.5 max-h-52 overflow-y-auto">
              {notes.map((n: { text: string; timestamp: string; state: string | null }, i: number) => (
                <div key={i} className="bg-muted/40 rounded-md px-3 py-2 text-xs">
                  <div className="text-foreground/90">{n.text}</div>
                  <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground/70">
                    <span>{formatTime(n.timestamp)}</span>
                    {n.state && OUTREACH_STYLES[n.state] && (
                      <>
                        <span>&middot;</span>
                        <span className={OUTREACH_STYLES[n.state].text}>{OUTREACH_STYLES[n.state].label}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">No notes yet</div>
          )}
        </div>
      </div>
    </div>
  );
}
