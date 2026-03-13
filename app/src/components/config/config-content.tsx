"use client";

import * as React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ConfigTab } from "@/components/config/config-tab";
import { SystemTab } from "@/components/config/system-tab";

const configFiles = [
  {
    key: "icp",
    label: "ICP Profiles",
    filename: "icp-config.json",
    description: "Ideal customer profile definitions, scoring weights, tier thresholds, and niche configurations.",
  },
  {
    key: "behavioral",
    label: "Behavioral",
    filename: "behavioral-config.json",
    description: "Behavioral scoring rules: connection power, recency, about/headline signals, super-connector index.",
  },
  {
    key: "outreach",
    label: "Outreach",
    filename: "outreach-config.json",
    description: "Outreach lifecycle states, rate limits, template selection rules, sequences, and compliance settings.",
  },
  {
    key: "referral",
    label: "Referral",
    filename: "referral-config.json",
    description: "Referral scoring weights, role tiers, target industries, referral personas, and network reach baselines.",
  },
];

export function ConfigContent() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuration</h1>
        <p className="text-muted-foreground text-sm">
          Manage scoring profiles, behavioral rules, and pipeline settings
        </p>
      </div>

      <Tabs defaultValue="icp">
        <TabsList>
          {configFiles.map((cf) => (
            <TabsTrigger key={cf.key} value={cf.key}>
              {cf.label}
            </TabsTrigger>
          ))}
          <TabsTrigger value="system">System</TabsTrigger>
        </TabsList>

        {configFiles.map((cf) => (
          <TabsContent key={cf.key} value={cf.key}>
            <ConfigTab
              filename={cf.filename}
              description={cf.description}
            />
          </TabsContent>
        ))}

        <TabsContent value="system">
          <SystemTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
