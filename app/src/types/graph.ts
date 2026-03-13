/**
 * Types for the graph.json data structure.
 *
 * graph.json is a SUPPLEMENTARY data source providing edge (relationship),
 * cluster, and company data that augments the primary RVF contact store.
 */

import type {
  GraphContact,
  Edge,
  ClusterData,
  CompanyData,
} from "./contact";

// ---------------------------------------------------------------------------
// Top-level graph.json shape
// ---------------------------------------------------------------------------

export interface GraphData {
  contacts: Record<string, GraphContact>;
  edges: Edge[];
  clusters: Record<string, ClusterData>;
  companies: Record<string, CompanyData>;
  meta: GraphMeta;
}

// ---------------------------------------------------------------------------
// Graph metadata — the "meta" field in graph.json
// ---------------------------------------------------------------------------

export interface GraphMeta {
  totalContacts: number;
  lastBuilt: string;
  version: number;
  lastScored: string;
  scoringVersion: number;
  lastBehavioralScored: string;
  behavioralVersion: number;
  lastReferralScored: string;
  referralVersion: number;
  lastEnriched: string;
}

// ---------------------------------------------------------------------------
// Adjacency map — keyed by contact URL, value is list of edges involving
// that contact (both as source and target).
// ---------------------------------------------------------------------------

export type AdjacencyMap = Map<string, Edge[]>;

// ---------------------------------------------------------------------------
// Cluster membership map — keyed by cluster label, value is set of contact URLs
// ---------------------------------------------------------------------------

export type ClusterMembershipMap = Map<string, Set<string>>;

// ---------------------------------------------------------------------------
// Company contact map — keyed by company slug, value is contact URLs
// ---------------------------------------------------------------------------

export type CompanyContactMap = Map<string, string[]>;
