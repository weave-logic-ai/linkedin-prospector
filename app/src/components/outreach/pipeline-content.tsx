"use client";

import * as React from "react";
import useSWR from "swr";
import { PipelineFunnel } from "@/components/outreach/pipeline-funnel";
import { StateCards } from "@/components/outreach/state-cards";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface FunnelStage {
  stage: string;
  count: number;
}

interface PipelineContact {
  url: string;
  slug: string;
  name: string;
  state: string;
  createdAt: string;
  lastTransition: string;
}

interface PipelineData {
  states: Record<string, number>;
  total: number;
  funnel: FunnelStage[];
  contacts: PipelineContact[];
  lastUpdated?: string;
}

const stateColors: Record<string, string> = {
  planned: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  sent: "bg-cyan-500/15 text-cyan-500 border-cyan-500/30",
  pending_response: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  responded: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  engaged: "bg-green-500/15 text-green-500 border-green-500/30",
  converted: "bg-violet-500/15 text-violet-500 border-violet-500/30",
  declined: "bg-red-500/15 text-red-500 border-red-500/30",
  deferred: "bg-gray-500/15 text-gray-500 border-gray-500/30",
  closed_lost: "bg-rose-500/15 text-rose-500 border-rose-500/30",
};

export function PipelineContent() {
  const { data, error, isLoading } = useSWR<PipelineData>(
    "/api/pipeline",
    fetcher,
    { refreshInterval: 30000 }
  );

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Outreach Pipeline
          </h1>
        </div>
        <Card>
          <CardContent className="py-8">
            <p className="text-sm text-destructive">
              Failed to load pipeline data
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Outreach Pipeline
          </h1>
          <p className="text-muted-foreground text-sm">
            Track outreach state across {data?.total ?? "..."} contacts
          </p>
        </div>
        {data?.lastUpdated && (
          <span className="text-xs text-muted-foreground">
            Updated {new Date(data.lastUpdated).toLocaleString()}
          </span>
        )}
      </div>

      {/* Funnel visualization */}
      {isLoading ? (
        <Card>
          <CardContent className="py-8">
            <div className="h-[120px] rounded bg-muted animate-pulse" />
          </CardContent>
        </Card>
      ) : (
        data?.funnel && <PipelineFunnel funnel={data.funnel} />
      )}

      {/* State cards */}
      {data?.states && <StateCards states={data.states} />}

      {/* Contact list */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Outreach Contacts</CardTitle>
            <Badge variant="secondary" className="text-[10px]">
              {data?.contacts?.length ?? 0}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-8 rounded bg-muted animate-pulse"
                />
              ))}
            </div>
          ) : data?.contacts && data.contacts.length > 0 ? (
            <div className="space-y-1">
              {/* Header */}
              <div className="grid grid-cols-[1fr_120px_140px] gap-2 text-[10px] text-muted-foreground uppercase tracking-wider pb-1 border-b border-border">
                <span>Contact</span>
                <span>State</span>
                <span>Last Updated</span>
              </div>
              {data.contacts.map((contact) => (
                <div
                  key={contact.url}
                  className="grid grid-cols-[1fr_120px_140px] gap-2 items-center py-1.5 text-xs hover:bg-muted/30 rounded px-1"
                >
                  <div className="min-w-0">
                    <a
                      href={contact.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-foreground hover:text-primary truncate block"
                    >
                      {contact.name}
                    </a>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] w-fit ${stateColors[contact.state] || ""}`}
                  >
                    {contact.state.replace(/_/g, " ")}
                  </Badge>
                  <span className="text-muted-foreground text-[10px] font-mono">
                    {new Date(contact.lastTransition).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No outreach contacts yet. Use Actions to generate an outreach
              plan.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
