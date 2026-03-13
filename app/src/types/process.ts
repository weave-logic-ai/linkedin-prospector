/**
 * Process manager types for the LinkedIn prospector pipeline.
 *
 * Covers rate budgeting, pipeline step tracking, and health monitoring.
 */

// ---------------------------------------------------------------------------
// Rate budget (rate-budget.json)
// ---------------------------------------------------------------------------

export interface OperationBudget {
  used: number;
  limit: number;
}

export interface RateBudgetOperations {
  profile_visits: OperationBudget;
  connection_requests: OperationBudget;
  messages_sent: OperationBudget;
  search_pages: OperationBudget;
  activity_feeds: OperationBudget;
}

export interface RateBudgetHistoryEntry {
  date: string;
  operations: RateBudgetOperations;
}

export interface RateBudgetFile {
  date: string;
  operations: RateBudgetOperations;
  history: RateBudgetHistoryEntry[];
}

// ---------------------------------------------------------------------------
// Operation type keys — for programmatic access
// ---------------------------------------------------------------------------

export type OperationType = keyof RateBudgetOperations;

// ---------------------------------------------------------------------------
// Pipeline step tracking
// ---------------------------------------------------------------------------

export type PipelineStep =
  | "scrape"
  | "enrich"
  | "vectorize"
  | "score"
  | "behavioral-score"
  | "referral-score"
  | "graph-build"
  | "outreach-plan"
  | "outreach-execute"
  | "activity-scan";

export interface PipelineStepStatus {
  step: PipelineStep;
  status: "idle" | "running" | "complete" | "error";
  lastRun: string | null;
  duration: number | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Data freshness — for staleness indicators in the UI
// ---------------------------------------------------------------------------

export interface DataFreshness {
  graphJson: {
    lastBuilt: string;
    staleAfterHours: number;
    isStale: boolean;
  };
  rvfStore: {
    entryCount: number;
    available: boolean;
  };
  outreachState: {
    lastUpdated: string;
    activeContacts: number;
  };
  rateBudget: {
    date: string;
    isCurrent: boolean;
    utilizationPercent: number;
  };
}

// ---------------------------------------------------------------------------
// Health check response
// ---------------------------------------------------------------------------

export interface HealthCheck {
  rvfAvailable: boolean;
  rvfEntryCount: number;
  graphJsonExists: boolean;
  graphContactCount: number;
  dataDir: string;
  scriptsDir: string;
  errors: string[];
}
