"use client";

// Lens selector — minimal `<select>` that switches the active lens for the
// current primary target. Phase 1.5 (polish is Phase 4).
//
// Renders nothing when the target has fewer than two lenses — picking among
// one option is not a choice. Activating a lens flips `is_default` on that
// lens row (see `app/src/lib/targets/lens-service.ts`) which feeds the
// per-target ICP plumbing read by the scoring pipeline.

import { useCallback, useEffect, useState } from "react";

interface LensDto {
  id: string;
  name: string;
  isDefault: boolean;
}

interface LensSelectorProps {
  primaryTargetId: string;
}

export function LensSelector({ primaryTargetId }: LensSelectorProps) {
  const [lenses, setLenses] = useState<LensDto[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/targets/${primaryTargetId}/lenses`);
        if (!res.ok) return;
        const json = (await res.json()) as { data: LensDto[] };
        if (cancelled) return;
        setLenses(json.data ?? []);
        const current = json.data?.find((l) => l.isDefault) ?? json.data?.[0];
        setActiveId(current?.id ?? null);
      } catch {
        // Silent — selector is additive UI and tolerates fetch failures.
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [primaryTargetId]);

  const handleChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const nextId = e.target.value;
      if (!nextId || nextId === activeId) return;
      setPending(true);
      try {
        await fetch(
          `/api/targets/${primaryTargetId}/lenses/${nextId}/activate`,
          { method: "PUT" }
        );
        setActiveId(nextId);
        setLenses((prev) =>
          prev.map((l) => ({ ...l, isDefault: l.id === nextId }))
        );
      } catch {
        // Silent — user can retry.
      } finally {
        setPending(false);
      }
    },
    [primaryTargetId, activeId]
  );

  if (lenses.length < 2) return null;

  return (
    <label className="flex items-center gap-1 text-xs text-muted-foreground">
      <span className="sr-only">Active lens</span>
      <span aria-hidden="true">Lens:</span>
      <select
        value={activeId ?? ""}
        onChange={handleChange}
        disabled={pending}
        className="rounded border border-border/40 bg-background px-1.5 py-0.5 text-xs"
        aria-label="Active lens for current target"
      >
        {lenses.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );
}
