"use client";

import * as React from "react";
import useSWR, { mutate } from "swr";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ConfigTabProps {
  filename: string;
  description: string;
}

export function ConfigTab({ filename, description }: ConfigTabProps) {
  const apiUrl = `/api/config/${filename}`;
  const { data, error, isLoading } = useSWR<{
    filename: string;
    data: unknown;
  }>(apiUrl, fetcher);

  const [editValue, setEditValue] = React.useState<string>("");
  const [isDirty, setIsDirty] = React.useState(false);
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saveMessage, setSaveMessage] = React.useState<string | null>(null);

  // Initialize edit value when data loads
  React.useEffect(() => {
    if (data?.data) {
      const formatted = JSON.stringify(data.data, null, 2);
      setEditValue(formatted);
      setIsDirty(false);
      setParseError(null);
    }
  }, [data]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setEditValue(val);
    setIsDirty(true);
    setSaveMessage(null);

    // Validate JSON
    try {
      JSON.parse(val);
      setParseError(null);
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : "Invalid JSON"
      );
    }
  };

  const handleSave = async () => {
    if (parseError) return;

    setSaving(true);
    setSaveMessage(null);

    try {
      const parsed = JSON.parse(editValue);
      const res = await fetch(apiUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: parsed }),
      });

      const result = await res.json();

      if (!res.ok) {
        setSaveMessage(`Error: ${result.error}`);
        return;
      }

      setSaveMessage(`Saved at ${new Date(result.savedAt).toLocaleTimeString()}`);
      setIsDirty(false);
      mutate(apiUrl);
    } catch (err) {
      setSaveMessage(
        `Error: ${err instanceof Error ? err.message : "Save failed"}`
      );
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (data?.data) {
      setEditValue(JSON.stringify(data.data, null, 2));
      setIsDirty(false);
      setParseError(null);
      setSaveMessage(null);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="h-[400px] rounded bg-muted animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">
            Failed to load config: {filename}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-mono">{filename}</CardTitle>
            <CardDescription className="text-xs mt-1">
              {description}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {isDirty && (
              <Badge variant="outline" className="text-[10px]">
                unsaved
              </Badge>
            )}
            {parseError && (
              <Badge variant="destructive" className="text-[10px]">
                invalid JSON
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={editValue}
          onChange={handleChange}
          className="font-mono text-xs min-h-[400px] resize-y bg-[#0d1117] text-gray-300 border-border"
          spellCheck={false}
        />

        {parseError && (
          <p className="text-xs text-destructive">{parseError}</p>
        )}

        {saveMessage && (
          <p
            className={`text-xs ${saveMessage.startsWith("Error") ? "text-destructive" : "text-emerald-500"}`}
          >
            {saveMessage}
          </p>
        )}

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!isDirty || !!parseError || saving}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleReset}
            disabled={!isDirty}
          >
            Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
