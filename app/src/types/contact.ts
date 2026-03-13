/**
 * Contact types matching the RVF metadata shape stored in network.rvf.
 *
 * The RVF store is the PRIMARY data source for all contact operations.
 * These types reflect the metadata fields built by rvf-store.mjs#buildMetadata().
 */

// ---------------------------------------------------------------------------
// RVF Metadata — the flat metadata object stored per-vector in the RVF store.
// Mirrors the shape produced by buildMetadata() in rvf-store.mjs.
// ---------------------------------------------------------------------------

export interface RvfMetadata {
  // Identity
  profileUrl: string;
  name: string;
  headline: string;
  title: string;
  location: string;
  currentRole: string;
  currentCompany: string;
  about: string;
  connections: string;
  mutualConnections: number;

  // Enrichment state
  enriched: boolean;
  enrichedAt: string;
  degree: number;
  discoveredVia: string[] | number;
  searchTerms: string[];

  // Layer 1: ICP + Gold Score (flattened from contact.scores)
  icpFit: number;
  networkHub: number;
  relationshipStrength: number;
  signalBoost: number;
  goldScore: number;
  tier: ContactTier;
  persona: string;

  // Layer 2: Behavioral (top-level on contact, flattened into metadata)
  behavioralScore: number;
  behavioralPersona: BehavioralPersona;

  // Layer 3: Referral (mixed origin, flattened into metadata)
  referralLikelihood: number;
  referralTier: ReferralTier;
  referralPersona: ReferralPersona;

  // Graph
  cluster: number;
  clusterLabel: string;

  // Timestamps
  createdAt: string;
  updatedAt: string;
  embeddedAt: string;
}

// ---------------------------------------------------------------------------
// RVF Entry — a single record from the VectorDB (id + vector + metadata)
// Returned by rvf-store.mjs#getContact(id)
// ---------------------------------------------------------------------------

export interface RvfEntry {
  id: string;
  vector: number[];
  metadata: RvfMetadata;
}

// ---------------------------------------------------------------------------
// Search result — returned by rvf-store.mjs#queryStore()
// ---------------------------------------------------------------------------

export interface ContactSearchResult {
  id: string;
  score: number;
  metadata: RvfMetadata;
}

// ---------------------------------------------------------------------------
// Tier and persona enums
// ---------------------------------------------------------------------------

export type ContactTier = "gold" | "silver" | "bronze" | "watch";

export type BehavioralPersona =
  | "super-connector"
  | "content-creator"
  | "silent-influencer"
  | "rising-connector"
  | "data-insufficient"
  | "passive-network";

export type ReferralTier =
  | "gold-referral"
  | "silver-referral"
  | "bronze-referral"
  | "";

export type ReferralPersona =
  | "white-label-partner"
  | "warm-introducer"
  | "co-seller"
  | "amplifier"
  | "passive-referral"
  | "";

// ---------------------------------------------------------------------------
// Graph.json contact shape — the SUPPLEMENTARY contact record stored in
// graph.json. More fields than RVF metadata (includes nested scores,
// behavioral signals, referral signals, activity, etc.).
// ---------------------------------------------------------------------------

export interface GraphContactScores {
  icpFit: number;
  networkHub: number;
  relationshipStrength: number;
  signalBoost: number;
  skillsRelevance: number | null;
  networkProximity: number;
  goldScore: number;
  tier: ContactTier;
  referralLikelihood?: number;
}

export interface PostEngagement {
  likes: number;
  comments: number;
  shares: number;
}

export interface ActivityPost {
  date: string;
  text: string;
  type: "post" | "article" | "repost-commentary" | string;
  engagement: PostEngagement;
  topics: string[];
}

export interface ActivityDetails {
  topicRelevance: number;
  recencyScore: number;
  engagementScore: number;
  frequencyScore: number;
}

export interface ContactActivity {
  lastScanned: string;
  posts: ActivityPost[];
  activityScore: number | null;
  activityDetails: ActivityDetails | null;
}

export interface BehavioralSignals {
  connectionCount: number;
  connectionPower: number | null;
  connectionRecency: number | null;
  connectedDaysAgo: number | null;
  aboutSignals: string[];
  headlineSignals: string[];
  superConnectorTraits: string[];
  traitCount: number;
  amplification: number | null;
  availableComponents: number;
  totalComponents: number;
}

export interface NetworkReachDetail {
  connections: number;
  clusters: number;
  edges: number;
}

export interface ReferralSignals {
  referralRole: number;
  referralRoleMatch: string;
  clientOverlap: number;
  clientOverlapIndustries: string[];
  networkReach: number;
  networkReachDetail: NetworkReachDetail;
  amplificationPower: number;
  amplificationSignals: string[];
  relationshipWarmth: number;
  buyerInversion: number;
}

export interface AccountPenetration {
  company: string;
  score: number;
  contactCount: number;
  senioritySpread: number;
  degreeSpread: number;
  avgGoldScore: number;
  tierPresence: number;
}

export interface GraphContact {
  // Core identity
  name: string;
  title: string;
  location: string;
  profileUrl: string;
  mutualConnections: number | string[] | null;
  currentInfo: string;
  pastInfo: string;
  searchTerms: string[];
  source: string;

  // Enrichment
  enrichedName?: string;
  headline?: string;
  enrichedLocation?: string;
  currentRole?: string;
  currentCompany?: string;
  about?: string;
  enriched: boolean;
  enrichedAt?: string;
  cachedAt?: string;
  connectionCount?: string;
  skills?: string[];

  // Discovery
  degree: number;
  linkedinDegree?: number;
  discoveredVia: string[] | number;
  discoveredAt?: string;

  // Deep scan
  deepScanned?: boolean;
  deepScannedAt?: string;
  deepScanResults?: number;

  // Company
  companyId?: string;

  // Scoring
  scores: GraphContactScores;
  personaType: string;
  icpCategories: string[];
  tags: string[];

  // Behavioral
  behavioralScore: number;
  behavioralPersona: BehavioralPersona;
  behavioralSignals: BehavioralSignals;

  // Referral
  referralTier: ReferralTier;
  referralPersona: ReferralPersona;
  referralSignals: ReferralSignals;

  // Activity
  activity?: ContactActivity;

  // Account penetration
  accountPenetration?: AccountPenetration;

  // connections field (string like "500+ connections")
  connections?: string;
}

// ---------------------------------------------------------------------------
// Edge — a relationship between two contacts in graph.json
// ---------------------------------------------------------------------------

export interface Edge {
  source: string;
  target: string;
  type: string;
  weight: number;
}

// ---------------------------------------------------------------------------
// Cluster — a thematic grouping of contacts
// ---------------------------------------------------------------------------

export interface ClusterData {
  label: string;
  keywords: string[];
  contacts: string[];
  hubContacts: string[];
}

// ---------------------------------------------------------------------------
// Company — account-level aggregation
// ---------------------------------------------------------------------------

export interface CompanyData {
  name: string;
  contacts: string[];
  penetrationScore: number;
  seniorityLevels: SeniorityLevels;
  goldContacts: number;
  silverContacts: number;
  avgGoldScore: number;
}

export interface SeniorityLevels {
  executive: number;
  senior: number;
  mid: number;
  individual: number;
}

// ---------------------------------------------------------------------------
// Pagination / list helpers
// ---------------------------------------------------------------------------

export type ContactSortField =
  | "goldScore"
  | "icpFit"
  | "networkHub"
  | "relationshipStrength"
  | "behavioralScore"
  | "referralLikelihood"
  | "name"
  | "updatedAt";

export type SortDirection = "asc" | "desc";

export interface ContactListParams {
  page?: number;
  pageSize?: number;
  sortBy?: ContactSortField;
  sortDir?: SortDirection;
  tier?: ContactTier | "all";
  cluster?: string;
  persona?: string;
  search?: string;
}

export interface ContactListResult {
  contacts: RvfMetadata[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Dashboard aggregates
// ---------------------------------------------------------------------------

export interface TierCounts {
  gold: number;
  silver: number;
  bronze: number;
  watch: number;
}

export interface DashboardAggregates {
  totalContacts: number;
  tierCounts: TierCounts;
  avgGoldScore: number;
  topPersonas: { persona: string; count: number }[];
  topClusters: { cluster: string; count: number }[];
  enrichedCount: number;
  enrichedPercent: number;
}
