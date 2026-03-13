"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import {
  Send, Clock, MessageSquare, UserCheck, Star, X, Pause, XCircle,
  Plus, ChevronRight, PenLine, Loader2,
} from "lucide-react";

const STATE_STYLES: Record<string, { bg: string; text: string; label: string; icon: typeof Clock }> = {
  planned: { bg: "bg-blue-500/15", text: "text-blue-500", label: "Planned", icon: Clock },
  sent: { bg: "bg-sky-500/15", text: "text-sky-500", label: "Sent", icon: Send },
  pending_response: { bg: "bg-amber-500/15", text: "text-amber-500", label: "Pending", icon: Clock },
  responded: { bg: "bg-emerald-500/15", text: "text-emerald-500", label: "Responded", icon: MessageSquare },
  engaged: { bg: "bg-green-500/15", text: "text-green-500", label: "Engaged", icon: UserCheck },
  converted: { bg: "bg-emerald-600/15", text: "text-emerald-600", label: "Converted", icon: Star },
  declined: { bg: "bg-red-400/15", text: "text-red-400", label: "Declined", icon: X },
  deferred: { bg: "bg-gray-400/15", text: "text-gray-400", label: "Deferred", icon: Pause },
  closed_lost: { bg: "bg-gray-600/15", text: "text-gray-600", label: "Lost", icon: XCircle },
};

interface TransitionEntry {
  from: string;
  to: string;
  timestamp: string;
  note: string | null;
}

interface NoteEntry {
  text: string;
  timestamp: string;
  state: string | null;
}

interface OutreachCellProps {
  contactId: string;
  state: string | null;
  noteCount: number;
  onStateChange?: () => void;
}

export function OutreachCell({ contactId, state, noteCount, onStateChange }: OutreachCellProps) {
  const [showActions, setShowActions] = useState(false);
  const [transitions, setTransitions] = useState<string[]>([]);
  const [history, setHistory] = useState<TransitionEntry[]>([]);
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentState, setCurrentState] = useState(state);
  const [localNoteCount, setLocalNoteCount] = useState(noteCount);
  const [transitionNote, setTransitionNote] = useState("");
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);

  // Close actions on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setShowActions(false);
      }
    }
    if (showActions) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [showActions]);

  const loadData = useCallback(async () => {
    if (dataLoaded) return;
    try {
      const [outreachRes, notesRes] = await Promise.all([
        fetch(`/api/contacts/${contactId}/outreach`),
        fetch(`/api/contacts/${contactId}/notes`),
      ]);
      const outreachData = await outreachRes.json();
      const notesData = await notesRes.json();
      setTransitions(outreachData.validTransitions || []);
      setHistory(outreachData.history || []);
      setNotes(notesData.notes || []);
      setLocalNoteCount(notesData.notes?.length || 0);
      setDataLoaded(true);
    } catch {
      /* ignore */
    }
  }, [contactId, dataLoaded]);

  async function transitionTo(newState: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}/outreach`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: newState, note: transitionNote || null }),
      });
      const data = await res.json();
      if (res.ok) {
        setCurrentState(newState);
        setTransitions(data.validTransitions || []);
        setHistory(data.history || []);
        setTransitionNote("");
        onStateChange?.();
      }
    } finally {
      setLoading(false);
      setShowActions(false);
    }
  }

  async function addNote() {
    if (!newNote.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}/notes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: newNote.trim(), state: currentState }),
      });
      const data = await res.json();
      if (res.ok) {
        setNotes(data.notes || []);
        setLocalNoteCount(data.notes?.length || 0);
        setNewNote("");
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

  const style = currentState ? STATE_STYLES[currentState] : null;
  const Icon = style?.icon || Plus;

  return (
    <div className="relative" ref={actionsRef}>
      <HoverCard openDelay={300} closeDelay={200}>
        <HoverCardTrigger>
          <div className="flex items-center gap-1">
            {/* Main badge -- click opens transition dropdown */}
            <button
              onClick={(e) => { e.stopPropagation(); loadData(); setShowActions(!showActions); }}
              className={currentState && style
                ? `inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${style.bg} ${style.text} hover:opacity-80 transition-opacity`
                : "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted transition-colors"
              }
            >
              <Icon className="h-2.5 w-2.5" />
              {style?.label || ""}
            </button>
            {/* Note indicator dot */}
            {localNoteCount > 0 && (
              <span className="flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-blue-500/20 px-1 text-[9px] font-medium text-blue-500">
                {localNoteCount}
              </span>
            )}
          </div>
        </HoverCardTrigger>
        <HoverCardContent side="bottom" align="start" className="w-80 p-0 max-h-[400px] overflow-hidden flex flex-col" sideOffset={8}>
          {/* Hover card content -- loads data on first hover */}
          <OutreachHoverContent
            currentState={currentState}
            style={style}
            history={history}
            notes={notes}
            dataLoaded={dataLoaded}
            loadData={loadData}
            newNote={newNote}
            setNewNote={setNewNote}
            savingNote={savingNote}
            addNote={addNote}
            formatTime={formatTime}
          />
        </HoverCardContent>
      </HoverCard>

      {/* Transition dropdown */}
      {showActions && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[200px] rounded-md border bg-popover p-2 shadow-lg">
          {loading ? (
            <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Updating...
            </div>
          ) : (
            <>
              <div className="text-[10px] font-medium text-muted-foreground px-2 pb-1">
                {currentState ? "Move to:" : "Start outreach:"}
              </div>
              {transitions.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  No transitions available
                </div>
              ) : (
                <>
                  {transitions.map((t) => {
                    const ts = STATE_STYLES[t];
                    const TIcon = ts?.icon || ChevronRight;
                    return (
                      <button
                        key={t}
                        onClick={() => transitionTo(t)}
                        className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted flex items-center gap-2 ${ts?.text || ""}`}
                      >
                        <TIcon className="h-3 w-3" />
                        {ts?.label || t}
                      </button>
                    );
                  })}
                  {/* Optional note for transition */}
                  <div className="border-t mt-1 pt-1">
                    <input
                      value={transitionNote}
                      onChange={(e) => setTransitionNote(e.target.value)}
                      placeholder="Add note with transition..."
                      className="w-full rounded border-0 bg-muted/50 px-2 py-1 text-[11px] outline-none placeholder:text-muted-foreground/50"
                    />
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function OutreachHoverContent({
  currentState,
  style,
  history,
  notes,
  dataLoaded,
  loadData,
  newNote,
  setNewNote,
  savingNote,
  addNote,
  formatTime,
}: {
  currentState: string | null;
  style: (typeof STATE_STYLES)[string] | null;
  history: TransitionEntry[];
  notes: NoteEntry[];
  dataLoaded: boolean;
  loadData: () => void;
  newNote: string;
  setNewNote: (v: string) => void;
  savingNote: boolean;
  addNote: () => void;
  formatTime: (iso: string) => string;
}) {
  useEffect(() => { loadData(); }, [loadData]);

  if (!dataLoaded) {
    return (
      <div className="flex items-center justify-center p-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const Icon = style?.icon || Plus;

  return (
    <>
      {/* Header */}
      <div className={`px-3 py-2 border-b flex items-center gap-2 ${style?.bg || "bg-muted/30"}`}>
        <Icon className={`h-4 w-4 ${style?.text || "text-muted-foreground"}`} />
        <div>
          <div className={`text-sm font-semibold ${style?.text || "text-muted-foreground"}`}>
            {style?.label || "No Outreach"}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {currentState ? "Current state" : "Click badge to start"}
          </div>
        </div>
      </div>

      {/* Timeline + Notes -- scrollable */}
      <div className="overflow-y-auto max-h-[260px] p-3 space-y-3">
        {/* Transition Timeline */}
        {history.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Timeline</div>
            <div className="space-y-1.5">
              {history.map((h, i) => {
                const toStyle = STATE_STYLES[h.to];
                return (
                  <div key={i} className="flex gap-2 text-[11px]">
                    <div className="flex flex-col items-center">
                      <div className={`h-2 w-2 rounded-full mt-1 ${toStyle?.text?.replace("text-", "bg-") || "bg-gray-400"}`} />
                      {i < history.length - 1 && <div className="w-px flex-1 bg-border mt-0.5" />}
                    </div>
                    <div className="flex-1 pb-1.5">
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">{STATE_STYLES[h.from]?.label || h.from}</span>
                        <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/50" />
                        <span className={toStyle?.text || ""}>{toStyle?.label || h.to}</span>
                      </div>
                      <div className="text-[9px] text-muted-foreground/70">{formatTime(h.timestamp)}</div>
                      {h.note && (
                        <div className="mt-0.5 text-[10px] text-foreground/80 bg-muted/50 rounded px-1.5 py-0.5">
                          {h.note}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Notes */}
        {notes.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Notes</div>
            <div className="space-y-1">
              {notes.map((n, i) => (
                <div key={i} className="bg-muted/40 rounded px-2 py-1.5 text-[11px]">
                  <div className="text-foreground/90">{n.text}</div>
                  <div className="flex items-center gap-1.5 mt-0.5 text-[9px] text-muted-foreground/70">
                    <span>{formatTime(n.timestamp)}</span>
                    {n.state && (
                      <>
                        <span>&middot;</span>
                        <span className={STATE_STYLES[n.state]?.text || ""}>{STATE_STYLES[n.state]?.label || n.state}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add note form */}
        <div>
          <div className="flex gap-1">
            <input
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addNote(); } }}
              placeholder="Add a note..."
              className="flex-1 rounded border bg-background px-2 py-1 text-[11px] outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              onClick={addNote}
              disabled={savingNote || !newNote.trim()}
              className="rounded bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {savingNote ? <Loader2 className="h-3 w-3 animate-spin" /> : <PenLine className="h-3 w-3" />}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
