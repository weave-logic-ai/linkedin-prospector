/**
 * Configuration file types.
 *
 * Maps the shapes of icp-config.json, behavioral-config.json,
 * outreach-config.json, and referral-config.json.
 */

// ---------------------------------------------------------------------------
// ICP Config (icp-config.json)
// ---------------------------------------------------------------------------

export interface IcpProfile {
  label: string;
  description: string;
  rolePatterns: {
    high: string[];
    medium: string[];
    low: string[];
  };
  industries: string[];
  signals: string[];
  companySizeSweet: {
    min: number;
    max: number;
  };
  weight: number;
}

export interface IcpScoring {
  roleWeight: number;
  industryWeight: number;
  signalWeight: number;
  companySizeWeight: number;
}

export interface GoldScoreWeights {
  icpWeight: number;
  networkHubWeight: number;
  relationshipWeight: number;
  signalBoostWeight: number;
  skillsRelevanceWeight: number;
  networkProximityWeight: number;
  behavioralWeight: number;
}

export interface TierThresholds {
  gold: number;
  silver: number;
  bronze: number;
}

export interface IcpConfig {
  profiles: Record<string, IcpProfile>;
  scoring: IcpScoring;
  goldScore: GoldScoreWeights;
  tiers: Record<string, TierThresholds>;
  niches: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Behavioral Config (behavioral-config.json)
// ---------------------------------------------------------------------------

export interface ConnectionPowerConfig {
  weight: number;
  thresholds: Record<string, number>;
  followerMultiplier: number;
}

export interface ConnectionRecencyConfig {
  weight: number;
  ranges: Record<string, number>;
}

export interface AboutSignalsConfig {
  weight: number;
  keywords: Record<string, string[]>;
}

export interface HeadlinePattern {
  regex?: string;
  keywords?: string[];
  score: number;
  description?: string;
}

export interface HeadlineSignalsConfig {
  weight: number;
  patterns: Record<string, HeadlinePattern>;
}

export interface SuperConnectorConfig {
  weight: number;
  minTraits: number;
  traitSources: string[];
}

export interface NetworkAmplifierConfig {
  weight: number;
  description: string;
}

export interface GoldScoreV2Weights {
  icpWeight: number;
  networkHubWeight: number;
  relationshipWeight: number;
  behavioralWeight: number;
  signalBoostWeight: number;
}

export interface BehavioralPersonaConfig {
  minTraits?: number;
  minConnections?: number;
  maxConnections?: number;
  maxAboutSignals?: number;
  recencyDays?: number;
  keywords?: string[];
  description: string;
}

export interface BehavioralConfig {
  connectionPower: ConnectionPowerConfig;
  connectionRecency: ConnectionRecencyConfig;
  aboutSignals: AboutSignalsConfig;
  headlineSignals: HeadlineSignalsConfig;
  superConnectorIndex: SuperConnectorConfig;
  networkAmplifier: NetworkAmplifierConfig;
  goldScoreV2: GoldScoreV2Weights;
  behavioralPersonas: Record<string, BehavioralPersonaConfig>;
}

// ---------------------------------------------------------------------------
// Outreach Config (outreach-config.json)
// ---------------------------------------------------------------------------

export interface OutreachLimits {
  dailyConnectionRequests: number;
  dailyMessages: number;
  weeklyNewConnections: number;
  dailyProfileViews: number;
  note: string;
}

export interface TemplateRule {
  persona?: string;
  tier?: string;
  template: string;
}

export interface TemplateSelectionConfig {
  rules: TemplateRule[];
  defaultTemplate: string;
}

export interface OutreachTrackingConfig {
  stateFile: string;
  autoAdvance: boolean;
  note: string;
}

export interface OutreachPriorities {
  tier: Record<string, number>;
  persona: Record<string, number>;
  recency: Record<string, number>;
}

export interface ReceptivenessWeights {
  relationshipStrength: number;
  behavioralScore: number;
  activityRecency: number;
  mutualConnections: number;
  referralLikelihood: number;
}

export interface OutreachSequenceStep {
  step: number;
  channel: string;
  delay_days: number;
  template_type: string;
  condition?: string;
}

export interface OutreachComplianceConfig {
  gdpr: {
    consentBasis: string;
    autoArchiveDays: number;
    note: string;
  };
  linkedin: {
    automationPolicy: string;
    note: string;
  };
}

export interface OutreachConfig {
  outreach: {
    lifecycle: {
      states: string[];
      transitions: Record<string, string[]>;
      defaultState: string;
    };
    limits: OutreachLimits;
    templateSelection: TemplateSelectionConfig;
    tracking: OutreachTrackingConfig;
    priorities: OutreachPriorities;
    scoring: {
      receptiveness: {
        weights: ReceptivenessWeights;
        note: string;
      };
    };
    sequences: Record<string, OutreachSequenceStep[]>;
    compliance: OutreachComplianceConfig;
  };
  version: string;
  lastUpdated: string;
}

// ---------------------------------------------------------------------------
// Referral Config (referral-config.json)
// ---------------------------------------------------------------------------

export interface RoleTier {
  score: number;
  patterns: string[];
}

export interface ReferralPersonaConfig {
  description: string;
  requires: {
    minReferralRole?: number;
    minClientOverlap?: number;
    minRelationshipWarmth?: number;
    minNetworkReach?: number;
    minAmplificationPower?: number;
    rolePatterns?: string[];
    behavioralPersonas?: string[];
  };
}

export interface NetworkReachBaselines {
  connectionCountNorm: number;
  clusterBreadthWeight: number;
  edgeDensityWeight: number;
  connectionCountWeight: number;
}

export interface ReferralConfig {
  weights: Record<string, number>;
  roleTiers: Record<string, RoleTier>;
  targetIndustries: string[];
  industrySignals: {
    servesTargetClients: string[];
    industryKeywords: string[];
  };
  referralTiers: Record<string, number>;
  personas: Record<string, ReferralPersonaConfig>;
  networkReachBaselines: NetworkReachBaselines;
}
