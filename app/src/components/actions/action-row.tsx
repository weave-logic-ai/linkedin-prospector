"use client";

import * as React from "react";
import { type ScriptDefinition } from "@/lib/script-definitions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ActionRowProps {
  script: ScriptDefinition;
  isRunning: boolean;
  onRun: (params: Record<string, string | number | boolean>) => void;
}

export function ActionRow({ script, isRunning, onRun }: ActionRowProps) {
  const [params, setParams] = React.useState<
    Record<string, string | number | boolean>
  >(() => {
    const defaults: Record<string, string | number | boolean> = {};
    for (const p of script.params) {
      if (p.default !== undefined) {
        defaults[p.name] = p.default;
      }
    }
    return defaults;
  });

  const handleParamChange = (name: string, value: string | number | boolean) => {
    setParams((prev) => ({ ...prev, [name]: value }));
  };

  const handleRun = () => {
    onRun(params);
  };

  const canRun = script.params
    .filter((p) => p.required)
    .every((p) => {
      const val = params[p.name];
      return val !== undefined && val !== null && val !== "";
    });

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-md border border-border p-3",
        "hover:border-primary/30 transition-colors",
        script.playwright && "border-l-2 border-l-amber-500/50"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{script.name}</span>
            {script.playwright && (
              <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30">
                browser
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {script.description}
          </p>
        </div>
        <Button
          size="sm"
          onClick={handleRun}
          disabled={isRunning || !canRun}
          className="shrink-0"
        >
          {isRunning ? "Running..." : "Run"}
        </Button>
      </div>

      {script.params.length > 0 && (
        <div className="flex flex-wrap items-end gap-3">
          {script.params.map((param) => (
            <div key={param.name} className="flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {param.label}
                {param.required && (
                  <span className="text-destructive ml-0.5">*</span>
                )}
              </label>
              {param.type === "select" && param.options ? (
                <Select
                  value={String(params[param.name] ?? "")}
                  onChange={(e) =>
                    handleParamChange(param.name, e.target.value)
                  }
                  className="h-8 w-[160px] text-xs"
                >
                  <option value="">Select...</option>
                  {param.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </Select>
              ) : param.type === "number" ? (
                <Input
                  type="number"
                  value={params[param.name] !== undefined ? String(params[param.name]) : ""}
                  onChange={(e) =>
                    handleParamChange(
                      param.name,
                      e.target.value ? Number(e.target.value) : ""
                    )
                  }
                  placeholder={
                    param.default !== undefined
                      ? String(param.default)
                      : undefined
                  }
                  className="h-8 w-[100px] text-xs"
                />
              ) : (
                <Input
                  type="text"
                  value={String(params[param.name] ?? "")}
                  onChange={(e) =>
                    handleParamChange(param.name, e.target.value)
                  }
                  placeholder={
                    param.default !== undefined
                      ? String(param.default)
                      : undefined
                  }
                  className="h-8 w-[200px] text-xs"
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
