// Phase 4 Track I — dashboard layout switcher.
//
// Server component that reads `research_target_state` via the existing
// service and decides whether to render the dashboard as single-column
// (default) or two-column (when a secondary target is set). Per the Q4
// decision in `10-decisions.md`, when a secondary target is chosen the UI
// re-centers on it and the primary (self) becomes the comparison lens:
//   - Left column: primary (self) — dimmed / subtle.
//   - Right column: secondary — emphasized.
//
// Layout rules:
//   - `RESEARCH_FLAGS.targets` must be true; otherwise we always render
//     single-column (preserves pre-Phase-4 behavior for the default build).
//   - No secondary → single-column (zero layout change for default users).
//   - Cards that don't make sense per-target (e.g. "Today's activity",
//     "Task queue", "Discovery feed") stay full-width regardless of split.
//   - Narrow viewport stacks (CSS grid's `md:grid-cols-2` breakpoint does
//     the stacking for free; we make the secondary the first child on
//     mobile by re-ordering via CSS, so the re-centered target reads first).

import type { ReactNode } from "react";
import { RESEARCH_FLAGS } from "@/lib/config/research-flags";
import {
  getCurrentOwnerProfileId,
  getResearchTargetState,
  getTargetById,
} from "@/lib/targets/service";

interface DashboardLayoutProps {
  /** Per-target cards. Rendered once in single-column mode and twice in split mode. */
  perTargetSlot: (ctx: DashboardTargetContext) => ReactNode;
  /** Full-width slot (network-wide cards like today's activity). */
  fullWidthSlot: ReactNode;
}

export interface DashboardTargetContext {
  role: "primary" | "secondary";
  targetId: string | null;
  label: string;
  /** True when the target should be visually emphasized (secondary in split mode). */
  emphasized: boolean;
}

export async function DashboardLayout({
  perTargetSlot,
  fullWidthSlot,
}: DashboardLayoutProps) {
  // Default single-column when the target system is off.
  if (!RESEARCH_FLAGS.targets) {
    return (
      <DashboardShell>
        {perTargetSlot({
          role: "primary",
          targetId: null,
          label: "Self",
          emphasized: true,
        })}
        {fullWidthSlot}
      </DashboardShell>
    );
  }

  const ownerId = await getCurrentOwnerProfileId();
  if (!ownerId) {
    return (
      <DashboardShell>
        {perTargetSlot({
          role: "primary",
          targetId: null,
          label: "Self",
          emphasized: true,
        })}
        {fullWidthSlot}
      </DashboardShell>
    );
  }

  const state = await getResearchTargetState(ownerId);
  const primaryTarget = state?.primaryTargetId
    ? await getTargetById(state.primaryTargetId)
    : null;
  const secondaryTarget = state?.secondaryTargetId
    ? await getTargetById(state.secondaryTargetId)
    : null;

  if (!secondaryTarget) {
    return (
      <DashboardShell>
        {perTargetSlot({
          role: "primary",
          targetId: primaryTarget?.id ?? null,
          label: primaryTarget?.label ?? "Self",
          emphasized: true,
        })}
        {fullWidthSlot}
      </DashboardShell>
    );
  }

  // Secondary set — render two columns. Primary dimmed on the left,
  // secondary emphasized on the right. `order` classes put the secondary
  // first on narrow viewports so the re-centered target is the first thing
  // the user sees when the layout stacks.
  return (
    <DashboardShell>
      <div
        className="grid gap-4 md:grid-cols-2"
        data-testid="dashboard-split"
        data-secondary-target-id={secondaryTarget.id}
      >
        <section
          data-testid="dashboard-primary-column"
          className="opacity-70 order-2 md:order-1 space-y-4"
          aria-label={`Primary target: ${primaryTarget?.label ?? "Self"} (comparison)`}
        >
          <header className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="uppercase tracking-wide">Comparison</span>
            <span className="font-medium text-foreground/80">
              {primaryTarget?.label ?? "Self"}
            </span>
          </header>
          {perTargetSlot({
            role: "primary",
            targetId: primaryTarget?.id ?? null,
            label: primaryTarget?.label ?? "Self",
            emphasized: false,
          })}
        </section>
        <section
          data-testid="dashboard-secondary-column"
          className="order-1 md:order-2 space-y-4"
          aria-label={`Focused target: ${secondaryTarget.label}`}
        >
          <header className="flex items-center gap-2 text-xs">
            <span className="uppercase tracking-wide text-primary">
              Focused
            </span>
            <span className="font-medium">{secondaryTarget.label}</span>
          </header>
          {perTargetSlot({
            role: "secondary",
            targetId: secondaryTarget.id,
            label: secondaryTarget.label,
            emphasized: true,
          })}
        </section>
      </div>
      {fullWidthSlot}
    </DashboardShell>
  );
}

function DashboardShell({ children }: { children: ReactNode }) {
  return <div className="space-y-4">{children}</div>;
}
