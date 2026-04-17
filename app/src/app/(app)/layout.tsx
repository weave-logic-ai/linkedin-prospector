import { AppShell } from "@/components/layout/app-shell";
import { CommandPalette } from "@/components/command-palette";
import { GoalToasterProvider } from "@/components/goals/goal-toaster";
import { GoalEngineRunner } from "@/components/goals/goal-engine-runner";
import { SuggestionEngineProvider } from "@/components/suggestion-engine-provider";
import { TargetSurface } from "@/components/targets/target-surface";

// Layout is async so we can call the TargetSurface server component (which
// reads research_target_state on every (app)/** page load — acceptance item
// in `.planning/research-tools-sprint/08-phased-delivery.md` §3.2).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SuggestionEngineProvider>
      <GoalToasterProvider>
        <AppShell>
          <TargetSurface />
          {children}
          <CommandPalette />
        </AppShell>
        <GoalEngineRunner />
      </GoalToasterProvider>
    </SuggestionEngineProvider>
  );
}
