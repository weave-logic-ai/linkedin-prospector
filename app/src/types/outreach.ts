/**
 * Outreach lifecycle types.
 *
 * Maps to outreach-state.json (state machine tracking) and
 * outreach-plan.json (generated action plans).
 */

// ---------------------------------------------------------------------------
// Outreach state machine
// ---------------------------------------------------------------------------

export type OutreachState =
  | "planned"
  | "sent"
  | "pending_response"
  | "responded"
  | "engaged"
  | "converted"
  | "declined"
  | "deferred"
  | "closed_lost";

/** Valid transitions from each state */
export const OUTREACH_TRANSITIONS: Record<OutreachState, OutreachState[]> = {
  planned: ["sent", "deferred"],
  sent: ["pending_response"],
  pending_response: ["responded", "declined", "deferred"],
  responded: ["engaged", "declined"],
  engaged: ["converted", "declined"],
  converted: [],
  declined: ["closed_lost", "deferred"],
  deferred: ["planned"],
  closed_lost: [],
};

// ---------------------------------------------------------------------------
// State file shape (outreach-state.json)
// ---------------------------------------------------------------------------

export interface OutreachTransition {
  from: OutreachState;
  to: OutreachState;
  timestamp: string;
}

export interface OutreachContactState {
  currentState: OutreachState;
  history: OutreachTransition[];
  createdAt: string;
}

export interface OutreachStateFile {
  contacts: Record<string, OutreachContactState>;
  version: string;
  lastUpdated: string;
}

// ---------------------------------------------------------------------------
// Outreach plan shape (outreach-plan.json)
// ---------------------------------------------------------------------------

export interface OutreachPlanContact {
  name: string;
  firstName: string;
  headline: string;
  currentRole: string;
  currentCompany: string;
  location: string;
  profileUrl: string;
  goldScore: number;
  tier: string;
  persona: string;
  icpFit: number;
  networkHub: number;
  relationshipStrength: number;
  degree: number;
  mutualConnections: string[] | number;
  mutualCount: number;
  bridgeContacts: string[];
  companyPeers: CompanyPeer[];
  sharedInterests: string[];
  clusters: string[];
  activityScore: number | null;
  lastActivity: string | null;
  receptiveness: number;
  recommendedApproach: string;
  referralLikelihood: number;
  enriched: boolean;
  dataCompleteness: number;
}

export interface CompanyPeer {
  name: string;
  url: string;
  role: string;
}

export interface OutreachAction {
  tier: string;
  contact: OutreachPlanContact;
  template: string;
  message: string;
  truncated: boolean;
  priority: number;
  timing: string;
}

export interface OutreachPlanMetadata {
  generatedAt: string;
  totalActions: number;
  tierCounts: {
    gold: number;
    silver: number;
    bronze: number;
  };
}

export interface OutreachPlanFile {
  metadata: OutreachPlanMetadata;
  actions: {
    tier1: OutreachAction[];
    tier2?: OutreachAction[];
    tier3?: OutreachAction[];
  };
}

// ---------------------------------------------------------------------------
// Outreach sequence step (from outreach-config.json)
// ---------------------------------------------------------------------------

export interface SequenceStep {
  step: number;
  channel: "linkedin_connection_request" | "linkedin_message" | "email" | string;
  delay_days: number;
  template_type: string;
  condition?: string;
}

// ---------------------------------------------------------------------------
// Outreach dashboard aggregates
// ---------------------------------------------------------------------------

export interface OutreachStats {
  totalPlanned: number;
  totalSent: number;
  totalPendingResponse: number;
  totalResponded: number;
  totalEngaged: number;
  totalConverted: number;
  totalDeclined: number;
  totalDeferred: number;
  totalClosedLost: number;
  conversionRate: number;
  responseRate: number;
}
