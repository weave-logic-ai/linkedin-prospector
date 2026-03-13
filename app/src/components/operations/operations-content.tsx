"use client";

import { OverrideToggle } from "@/components/operations/override-toggle";
import { OperationsTable } from "@/components/operations/operations-table";

export function OperationsContent() {
  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold">Operations</h1>
        <p className="text-sm text-muted-foreground">
          LinkedIn override control and script execution history
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div>
          <OverrideToggle />
        </div>
        <OperationsTable />
      </div>
    </div>
  );
}
