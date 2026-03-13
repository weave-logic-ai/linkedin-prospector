"use client";

import * as React from "react";
import useSWR from "swr";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface DashboardData {
  total?: number;
  tierCounts?: Record<string, number>;
}

interface PipelineData {
  total?: number;
  states?: Record<string, number>;
  lastUpdated?: string;
}

interface BudgetData {
  date?: string;
  operations?: Record<string, { used: number; limit: number }>;
}

export function SystemTab() {
  const { data: dashData } = useSWR<DashboardData>(
    "/api/contacts?pageSize=1",
    fetcher
  );
  const { data: pipeData } = useSWR<PipelineData>("/api/pipeline", fetcher);
  const { data: budgetData } = useSWR<BudgetData>("/api/budget", fetcher);

  return (
    <div className="space-y-4">
      {/* Data Inventory */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Data Inventory</CardTitle>
          <CardDescription className="text-xs">
            Summary of data files and pipeline state
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Contacts</span>
                <span className="font-mono tabular-nums">
                  {dashData?.total ?? "..."}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Outreach Contacts</span>
                <span className="font-mono tabular-nums">
                  {pipeData?.total ?? "..."}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Budget Date</span>
                <span className="font-mono tabular-nums">
                  {budgetData?.date ?? "..."}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              {pipeData?.states &&
                Object.entries(pipeData.states)
                  .filter(([, count]) => count > 0)
                  .map(([state, count]) => (
                    <div key={state} className="flex justify-between">
                      <span className="text-muted-foreground">{state}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {count}
                      </Badge>
                    </div>
                  ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pipeline Timestamps */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Pipeline State</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Outreach Last Updated
              </span>
              <span className="font-mono text-xs">
                {pipeData?.lastUpdated
                  ? new Date(pipeData.lastUpdated).toLocaleString()
                  : "N/A"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Config Files */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Config Files</CardTitle>
          <CardDescription className="text-xs">
            Configuration files managed by this dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {[
              "icp-config.json",
              "behavioral-config.json",
              "outreach-config.json",
              "referral-config.json",
              "rate-budget.json",
              "outreach-templates.yaml",
            ].map((file) => (
              <div
                key={file}
                className="flex items-center justify-between text-xs py-1"
              >
                <span className="font-mono text-muted-foreground">{file}</span>
                <Badge variant="outline" className="text-[10px]">
                  config
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* GDPR Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">GDPR & Compliance</CardTitle>
          <CardDescription className="text-xs">
            Data protection controls
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Consent Basis</span>
              <span>Legitimate Interest</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Auto Archive</span>
              <span>180 days</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Automation Policy</span>
              <span>Generate Only (no auto-send)</span>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Use the Actions page &rarr; GDPR Forget to remove a contact from all data.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
