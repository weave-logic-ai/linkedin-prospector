"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import type { ColorByMode, EdgeTypeFilters, LayoutMode, SizeByMode, LabelMode, GraphSettings } from "./network-content";

interface GraphControlsProps {
  settings: GraphSettings;
  onSettingsChange: (settings: Partial<GraphSettings>) => void;
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1"
      >
        {title}
        <ChevronDown className={cn("h-3 w-3 transition-transform", open ? "" : "-rotate-90")} />
      </button>
      {open && <div className="space-y-2">{children}</div>}
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] mb-0.5">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">{step >= 1 ? value : value.toFixed(1)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 accent-primary cursor-pointer"
      />
    </div>
  );
}

export function GraphControls({ settings, onSettingsChange }: GraphControlsProps) {
  const update = (patch: Partial<GraphSettings>) => onSettingsChange(patch);

  return (
    <div className="rounded-lg border border-border bg-card/95 backdrop-blur p-3 space-y-3 w-52 text-xs shadow-lg max-h-[calc(100vh-10rem)] overflow-y-auto">

      <Section title="Layout">
        <select
          value={settings.layout}
          onChange={(e) => update({ layout: e.target.value as LayoutMode })}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="force">Force Directed</option>
          <option value="cluster-grouped">Cluster Grouped</option>
          <option value="gold-centered">Gold Centered</option>
          <option value="radial">Radial (Gold Core)</option>
        </select>

        <Slider label="Repulsion" value={settings.repulsion} min={50} max={1000} step={50} onChange={(v) => update({ repulsion: v })} />
        <Slider label="Attraction" value={settings.attraction} min={0.001} max={0.02} step={0.001} onChange={(v) => update({ attraction: v })} />
        <Slider label="Gravity" value={settings.gravity} min={0} max={0.01} step={0.001} onChange={(v) => update({ gravity: v })} />
      </Section>

      <Section title="Appearance">
        <div>
          <span className="text-[10px] text-muted-foreground">Color by</span>
          <select
            value={settings.colorBy}
            onChange={(e) => update({ colorBy: e.target.value as ColorByMode })}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs mt-0.5"
          >
            <option value="tier">Tier</option>
            <option value="cluster">Cluster</option>
            <option value="persona">Persona</option>
            <option value="degree">Degree</option>
          </select>
        </div>
        <div>
          <span className="text-[10px] text-muted-foreground">Size by</span>
          <select
            value={settings.sizeBy}
            onChange={(e) => update({ sizeBy: e.target.value as SizeByMode })}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs mt-0.5"
          >
            <option value="tier">Tier</option>
            <option value="goldScore">Gold Score</option>
            <option value="connections">Connections</option>
            <option value="uniform">Uniform</option>
          </select>
        </div>
        <div>
          <span className="text-[10px] text-muted-foreground">Labels</span>
          <select
            value={settings.labelMode}
            onChange={(e) => update({ labelMode: e.target.value as LabelMode })}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs mt-0.5"
          >
            <option value="gold">Gold only</option>
            <option value="all">All contacts</option>
            <option value="hover">On hover only</option>
            <option value="none">None</option>
          </select>
        </div>
      </Section>

      <Section title="Edges" defaultOpen={false}>
        {(["same-company", "same-cluster", "mutual-proximity"] as const).map((key) => (
          <label key={key} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.edgeTypes[key]}
              onChange={(e) => update({ edgeTypes: { ...settings.edgeTypes, [key]: e.target.checked } })}
              className="h-3 w-3 rounded border-border accent-primary"
            />
            <span className="text-foreground capitalize">{key.replace(/-/g, " ")}</span>
          </label>
        ))}
        <Slider label="Min weight" value={settings.weightThreshold} min={0} max={1} step={0.1} onChange={(v) => update({ weightThreshold: v })} />
        <Slider label="Edge opacity" value={settings.edgeOpacity} min={0.05} max={0.5} step={0.05} onChange={(v) => update({ edgeOpacity: v })} />
      </Section>

      <Section title="Data" defaultOpen={false}>
        <Slider label="Max nodes" value={settings.maxNodes} min={50} max={500} step={50} onChange={(v) => update({ maxNodes: v })} />
        <Slider label="KNN (k)" value={settings.knn} min={2} max={20} step={1} onChange={(v) => update({ knn: v })} />
        <div className="pt-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.showClusterLabels}
              onChange={(e) => update({ showClusterLabels: e.target.checked })}
              className="h-3 w-3 rounded border-border accent-primary"
            />
            <span className="text-foreground">Cluster labels</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer mt-1">
            <input
              type="checkbox"
              checked={settings.showClusterHulls}
              onChange={(e) => update({ showClusterHulls: e.target.checked })}
              className="h-3 w-3 rounded border-border accent-primary"
            />
            <span className="text-foreground">Cluster boundaries</span>
          </label>
        </div>
      </Section>
    </div>
  );
}
