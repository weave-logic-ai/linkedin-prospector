"use client";

import { useEffect, useState } from "react";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Crosshair } from "lucide-react";

interface IcpDimension {
  dimension: string;
  value: number;
}

const DIMENSION_LABELS: Record<string, string> = {
  company_size: "Company Size",
  industry_fit: "Industry Fit",
  role_match: "Role Match",
  location: "Location",
  signals: "Signals",
  seniority: "Seniority",
  skills: "Skills",
  experience: "Experience",
};

export function IcpRadarChart() {
  const [dimensions, setDimensions] = useState<IcpDimension[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/icp/profiles");
        if (res.ok) {
          const json = await res.json();
          const profiles = json.data || [];
          if (profiles.length > 0) {
            const profile = profiles[0];
            const dims: IcpDimension[] = [];
            const weights = profile.weights || profile.dimensions || {};

            for (const [key, val] of Object.entries(weights)) {
              if (typeof val === "number") {
                dims.push({
                  dimension: DIMENSION_LABELS[key] || key,
                  value: Math.round(val * 100),
                });
              }
            }

            if (dims.length > 0) {
              setDimensions(dims);
            }
          }
        }
      } catch {
        // Empty state
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">ICP Dimensions</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
            Loading...
          </div>
        ) : dimensions.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <Crosshair className="h-8 w-8 opacity-40" />
            <span>Create an ICP to see the radar chart</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={dimensions} cx="50%" cy="50%" outerRadius="70%">
              <PolarGrid stroke="currentColor" className="text-border" />
              <PolarAngleAxis
                dataKey="dimension"
                tick={{ fontSize: 10, fill: "currentColor" }}
                className="text-muted-foreground"
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 100]}
                tick={false}
                axisLine={false}
              />
              <Radar
                name="ICP Score"
                dataKey="value"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary))"
                fillOpacity={0.2}
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
