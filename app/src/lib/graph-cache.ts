/**
 * Graph Cache — SUPPLEMENTARY data layer for edge, cluster, and company data.
 *
 * graph.json is loaded lazily on first access and cached as a module-scope
 * singleton. The cache is invalidated when the file's mtime changes
 * (checked at most every 10 seconds to avoid excessive stat() calls).
 *
 * This module is only needed when the UI requires:
 * - Edges (relationships) between contacts
 * - Cluster membership lists
 * - Company (account) aggregation data
 *
 * For contact-level data, always prefer the RVF service (rvf-service.ts).
 *
 * @module graph-cache
 */

import {
  GRAPH_JSON_PATH,
  readJsonPath,
  getPathMtime,
} from "./data";

import type { GraphData, AdjacencyMap, ClusterMembershipMap, CompanyContactMap } from "@/types/graph";
import type { Edge, ClusterData, CompanyData, GraphContact } from "@/types/contact";

// ---------------------------------------------------------------------------
// Cache state
// ---------------------------------------------------------------------------

interface GraphCache {
  data: GraphData | null;
  adjacency: AdjacencyMap | null;
  clusterMembers: ClusterMembershipMap | null;
  companyContacts: CompanyContactMap | null;
  loadedAt: number;
  fileMtime: number;
}

let _cache: GraphCache = {
  data: null,
  adjacency: null,
  clusterMembers: null,
  companyContacts: null,
  loadedAt: 0,
  fileMtime: 0,
};

/** Minimum interval between mtime checks (ms) */
const STALE_CHECK_INTERVAL_MS = 10_000;

/** Last time we checked the file mtime */
let _lastStaleCheck = 0;

// ---------------------------------------------------------------------------
// Cache management
// ---------------------------------------------------------------------------

/**
 * Check if the cache might be stale (file mtime changed).
 * Only performs the stat() call at most every 10 seconds.
 */
async function maybeInvalidate(): Promise<void> {
  const now = Date.now();
  if (now - _lastStaleCheck < STALE_CHECK_INTERVAL_MS) return;

  _lastStaleCheck = now;
  const mtime = await getPathMtime(GRAPH_JSON_PATH);
  if (!mtime) return;

  const mtimeMs = mtime.getTime();
  if (mtimeMs !== _cache.fileMtime) {
    // File has changed — invalidate everything
    invalidateCache();
  }
}

/**
 * Force-invalidate the entire graph cache.
 */
export function invalidateCache(): void {
  _cache = {
    data: null,
    adjacency: null,
    clusterMembers: null,
    companyContacts: null,
    loadedAt: 0,
    fileMtime: 0,
  };
}

/**
 * Ensure graph data is loaded and fresh.
 */
async function ensureLoaded(): Promise<GraphData | null> {
  await maybeInvalidate();

  if (_cache.data) return _cache.data;

  const data = await readJsonPath<GraphData>(GRAPH_JSON_PATH);
  if (!data) return null;

  const mtime = await getPathMtime(GRAPH_JSON_PATH);

  _cache.data = data;
  _cache.loadedAt = Date.now();
  _cache.fileMtime = mtime?.getTime() ?? 0;

  // Reset derived caches so they rebuild on next access
  _cache.adjacency = null;
  _cache.clusterMembers = null;
  _cache.companyContacts = null;

  return data;
}

// ---------------------------------------------------------------------------
// Public API — Graph Data
// ---------------------------------------------------------------------------

/**
 * Get the full parsed graph.json data.
 */
export async function getGraphData(): Promise<GraphData | null> {
  return ensureLoaded();
}

/**
 * Get the graph metadata (scoring timestamps, version, etc.).
 */
export async function getGraphMeta(): Promise<GraphData["meta"] | null> {
  const data = await ensureLoaded();
  return data?.meta ?? null;
}

/**
 * Get a single contact record from graph.json.
 */
export async function getGraphContact(url: string): Promise<GraphContact | null> {
  const data = await ensureLoaded();
  return data?.contacts?.[url] ?? null;
}

// ---------------------------------------------------------------------------
// Public API — Edges (Adjacency)
// ---------------------------------------------------------------------------

/**
 * Build and cache the adjacency map from edges.
 * Keyed by contact URL, value is all edges involving that contact.
 */
async function ensureAdjacency(): Promise<AdjacencyMap> {
  const data = await ensureLoaded();
  if (_cache.adjacency) return _cache.adjacency;

  const map: AdjacencyMap = new Map();

  if (data?.edges) {
    for (const edge of data.edges) {
      // Add edge to source's list
      if (!map.has(edge.source)) map.set(edge.source, []);
      map.get(edge.source)!.push(edge);

      // Add edge to target's list
      if (!map.has(edge.target)) map.set(edge.target, []);
      map.get(edge.target)!.push(edge);
    }
  }

  _cache.adjacency = map;
  return map;
}

/**
 * Get all edges involving a specific contact.
 */
export async function getEdgesForContact(contactUrl: string): Promise<Edge[]> {
  const adj = await ensureAdjacency();
  return adj.get(contactUrl) ?? [];
}

/**
 * Get all edges in the graph.
 */
export async function getAllEdges(): Promise<Edge[]> {
  const data = await ensureLoaded();
  return data?.edges ?? [];
}

/**
 * Get the total number of edges.
 */
export async function getEdgeCount(): Promise<number> {
  const data = await ensureLoaded();
  return data?.edges?.length ?? 0;
}

/**
 * Get direct neighbors of a contact (contacts connected by edges).
 * Returns unique URLs of neighboring contacts.
 */
export async function getNeighbors(contactUrl: string): Promise<string[]> {
  const edges = await getEdgesForContact(contactUrl);
  const neighbors = new Set<string>();
  for (const edge of edges) {
    if (edge.source === contactUrl) neighbors.add(edge.target);
    if (edge.target === contactUrl) neighbors.add(edge.source);
  }
  return [...neighbors];
}

// ---------------------------------------------------------------------------
// Public API — Clusters
// ---------------------------------------------------------------------------

/**
 * Build and cache cluster membership mapping.
 */
async function ensureClusterMembers(): Promise<ClusterMembershipMap> {
  const data = await ensureLoaded();
  if (_cache.clusterMembers) return _cache.clusterMembers;

  const map: ClusterMembershipMap = new Map();

  if (data?.clusters) {
    for (const [label, cluster] of Object.entries(data.clusters)) {
      const members = new Set<string>();
      for (const url of cluster.contacts ?? []) {
        members.add(url);
      }
      for (const url of cluster.hubContacts ?? []) {
        members.add(url);
      }
      map.set(label, members);
    }
  }

  _cache.clusterMembers = map;
  return map;
}

/**
 * Get all members of a cluster by label.
 */
export async function getClusterMembers(clusterLabel: string): Promise<string[]> {
  const map = await ensureClusterMembers();
  const members = map.get(clusterLabel);
  return members ? [...members] : [];
}

/**
 * Get all cluster data.
 */
export async function getAllClusters(): Promise<Record<string, ClusterData>> {
  const data = await ensureLoaded();
  return data?.clusters ?? {};
}

/**
 * Get cluster metadata for a specific cluster.
 */
export async function getCluster(label: string): Promise<ClusterData | null> {
  const data = await ensureLoaded();
  return data?.clusters?.[label] ?? null;
}

/**
 * Get all cluster labels.
 */
export async function getClusterLabels(): Promise<string[]> {
  const data = await ensureLoaded();
  return Object.keys(data?.clusters ?? {});
}

// ---------------------------------------------------------------------------
// Public API — Companies
// ---------------------------------------------------------------------------

/**
 * Build and cache company-to-contacts mapping.
 */
async function ensureCompanyContacts(): Promise<CompanyContactMap> {
  const data = await ensureLoaded();
  if (_cache.companyContacts) return _cache.companyContacts;

  const map: CompanyContactMap = new Map();

  if (data?.companies) {
    for (const [slug, company] of Object.entries(data.companies)) {
      map.set(slug, company.contacts ?? []);
    }
  }

  _cache.companyContacts = map;
  return map;
}

/**
 * Get all company data.
 */
export async function getAllCompanies(): Promise<Record<string, CompanyData>> {
  const data = await ensureLoaded();
  return data?.companies ?? {};
}

/**
 * Get company data by slug.
 */
export async function getCompanyData(slug: string): Promise<CompanyData | null> {
  const data = await ensureLoaded();
  return data?.companies?.[slug] ?? null;
}

/**
 * Get contacts belonging to a company.
 */
export async function getCompanyContacts(companySlug: string): Promise<string[]> {
  const map = await ensureCompanyContacts();
  return map.get(companySlug) ?? [];
}

/**
 * Get all company slugs.
 */
export async function getCompanySlugs(): Promise<string[]> {
  const data = await ensureLoaded();
  return Object.keys(data?.companies ?? {});
}

/**
 * Get top companies sorted by penetration score.
 */
export async function getTopCompanies(limit = 20): Promise<(CompanyData & { slug: string })[]> {
  const data = await ensureLoaded();
  if (!data?.companies) return [];

  return Object.entries(data.companies)
    .map(([slug, company]) => ({ ...company, slug }))
    .sort((a, b) => b.penetrationScore - a.penetrationScore)
    .slice(0, limit);
}
