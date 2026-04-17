// Server component that reads research_target_state and mounts the breadcrumbs
// + picker. When `RESEARCH_FLAGS.targets` is false, or when no owner profile
// exists yet, this component renders nothing so existing pages keep their
// current layout.
//
// WS-4 Phase 1 Track B acceptance: "research_target_state read/written on
// every server-component page load." Placing this inside the (app) layout
// hits every authenticated page.

import { RESEARCH_FLAGS } from "@/lib/config/research-flags";
import {
  getCurrentOwnerProfileId,
  getResearchTargetState,
  getTargetById,
} from "@/lib/targets/service";
import { TargetBreadcrumbs } from "./target-breadcrumbs";
import { TargetPickerModal } from "./target-picker-modal";
import { LensSelector } from "./lens-selector";

export async function TargetSurface() {
  if (!RESEARCH_FLAGS.targets) return null;

  const ownerId = await getCurrentOwnerProfileId();
  if (!ownerId) return null;

  // This call creates the state row on first access and always returns a
  // state with primary pointing at the owner's self target.
  const state = await getResearchTargetState(ownerId);
  if (!state) return null;

  let primaryLabel = "Self";
  let secondaryLabel: string | null = null;

  if (state.primaryTargetId) {
    const primary = await getTargetById(state.primaryTargetId);
    if (primary) primaryLabel = primary.label;
  }
  if (state.secondaryTargetId) {
    const secondary = await getTargetById(state.secondaryTargetId);
    if (secondary) secondaryLabel = secondary.label;
  }

  return (
    <>
      <TargetBreadcrumbs
        initialPrimaryLabel={primaryLabel}
        initialSecondaryLabel={secondaryLabel}
        initialSecondaryTargetId={state.secondaryTargetId}
      />
      {state.primaryTargetId ? (
        <div className="flex items-center justify-end border-b border-border/40 bg-muted/10 px-4 py-1">
          <LensSelector primaryTargetId={state.primaryTargetId} />
        </div>
      ) : null}
      <TargetPickerModal />
    </>
  );
}
