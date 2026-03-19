"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { X, Save, Loader2, Plus } from "lucide-react";

interface IcpRow {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  criteria: Record<string, unknown>;
}

interface IcpBuilderModalProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  icp?: IcpRow;
}

const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001-10000", "10001+"];

function TagInput({
  label,
  tags,
  onAdd,
  onRemove,
  placeholder,
}: {
  label: string;
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && input.trim()) {
      e.preventDefault();
      onAdd(input.trim());
      setInput("");
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex gap-1.5">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="h-8 text-sm"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 px-2"
          onClick={() => {
            if (input.trim()) {
              onAdd(input.trim());
              setInput("");
            }
          }}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs gap-1">
              {tag}
              <button onClick={() => onRemove(tag)} className="hover:text-destructive">
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function IcpBuilderModal({ open, onClose, onSave, icp }: IcpBuilderModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [companySizes, setCompanySizes] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [signals, setSignals] = useState<string[]>([]);
  const [minConnections, setMinConnections] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const isEdit = !!icp;

  useEffect(() => {
    if (icp) {
      setName(icp.name);
      setDescription(icp.description ?? "");
      setIsActive(icp.isActive);
      const c = icp.criteria;
      setRoles((c.roles as string[]) ?? []);
      setIndustries((c.industries as string[]) ?? []);
      setCompanySizes((c.companySizeRanges as string[]) ?? []);
      setLocations((c.locations as string[]) ?? []);
      setSignals((c.signals as string[]) ?? []);
      setMinConnections((c.minConnections as number) ?? 0);
    } else {
      setName("");
      setDescription("");
      setRoles([]);
      setIndustries([]);
      setCompanySizes([]);
      setLocations([]);
      setSignals([]);
      setMinConnections(0);
      setIsActive(true);
    }
  }, [icp, open]);

  const addTag = useCallback(
    (setter: React.Dispatch<React.SetStateAction<string[]>>) => (tag: string) => {
      setter((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    },
    []
  );

  const removeTag = useCallback(
    (setter: React.Dispatch<React.SetStateAction<string[]>>) => (tag: string) => {
      setter((prev) => prev.filter((t) => t !== tag));
    },
    []
  );

  const hasAnyCriteria =
    roles.length > 0 ||
    industries.length > 0 ||
    companySizes.length > 0 ||
    locations.length > 0 ||
    signals.length > 0 ||
    minConnections > 0;

  async function handleSave() {
    if (!name.trim() || !hasAnyCriteria) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        is_active: isActive,
        criteria: {
          roles,
          industries,
          companySizeRanges: companySizes,
          locations,
          minConnections,
          signals,
        },
      };

      const url = isEdit ? `/api/icps/${icp.id}` : "/api/icps";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        onSave();
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg border shadow-lg w-full max-w-md mx-4 p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">
            {isEdit ? "Edit ICP" : "New ICP"}
          </h3>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4">
          {/* Profile Info */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Name *</p>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., SaaS Decision Makers"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Description</p>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description..."
                className="h-8 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-muted-foreground">Active</label>
              <button
                type="button"
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  isActive ? "bg-primary" : "bg-muted"
                }`}
                onClick={() => setIsActive(!isActive)}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-background transition-transform ${
                    isActive ? "translate-x-4.5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Criteria */}
          <div className="border-t pt-4 space-y-4">
            <p className="text-sm font-medium">Criteria</p>

            <TagInput
              label="Role Patterns"
              tags={roles}
              onAdd={addTag(setRoles)}
              onRemove={removeTag(setRoles)}
              placeholder="CEO, VP Sales, etc."
            />

            <TagInput
              label="Industries"
              tags={industries}
              onAdd={addTag(setIndustries)}
              onRemove={removeTag(setIndustries)}
              placeholder="SaaS, FinTech, etc."
            />

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Company Size</p>
              <div className="flex flex-wrap gap-1.5">
                {COMPANY_SIZES.map((size) => (
                  <Badge
                    key={size}
                    variant={companySizes.includes(size) ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => {
                      setCompanySizes((prev) =>
                        prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]
                      );
                    }}
                  >
                    {size}
                  </Badge>
                ))}
              </div>
            </div>

            <TagInput
              label="Locations"
              tags={locations}
              onAdd={addTag(setLocations)}
              onRemove={removeTag(setLocations)}
              placeholder="San Francisco, London, etc."
            />

            <TagInput
              label="Signal Keywords"
              tags={signals}
              onAdd={addTag(setSignals)}
              onRemove={removeTag(setSignals)}
              placeholder="hiring, fundraising, etc."
            />

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Min Connections</p>
                <span className="text-xs text-muted-foreground">{minConnections}</span>
              </div>
              <input
                type="range"
                min={0}
                max={500}
                step={10}
                value={minConnections}
                onChange={(e) => setMinConnections(parseInt(e.target.value, 10))}
                className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!name.trim() || !hasAnyCriteria || saving}
          >
            {saving ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Save className="h-3 w-3 mr-1" />
            )}
            {isEdit ? "Update" : "Create"}
          </Button>
        </div>
      </div>
    </div>
  );
}
