import { AppShell } from "@/components/layout/app-shell";
import { CommandPalette } from "@/components/command-palette";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      {children}
      <CommandPalette />
    </AppShell>
  );
}
