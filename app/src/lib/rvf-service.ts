/**
 * RVF Service — PRIMARY data access layer for contact operations.
 *
 * Wraps rvf-store.mjs with typed TypeScript interfaces. This is the most
 * important data layer file: all contact reads and writes go through here.
 *
 * Architecture notes:
 * - rvf-store.mjs is an ESM module (.mjs), so we use dynamic imports.
 * - process.env.PROSPECTOR_DATA_DIR must be set before the first import.
 * - The VectorDB does NOT have a "list all" / "entries()" method. To list
 *   contacts we maintain a contact URL index from graph.json and hydrate
 *   metadata from the RVF store per-contact. This hybrid approach gives us
 *   the best of both: graph.json provides the complete index of known
 *   contacts, and RVF provides the scored/embedded metadata.
 * - If ruvector is not installed, all functions gracefully return null/empty.
 *
 * @module rvf-service
 */

import {
  DATA_DIR,
  SCRIPTS_DIR,
  GRAPH_JSON_PATH,
  readJsonPath,
} from "./data";

import type {
  RvfMetadata,
  RvfEntry,
  ContactSearchResult,
  ContactTier,
  ContactListParams,
  ContactListResult,
  DashboardAggregates,
  TierCounts,
  GraphContact,
} from "@/types/contact";
import type { GraphData } from "@/types/graph";

// ---------------------------------------------------------------------------
// Module-level cache for the dynamic import
// ---------------------------------------------------------------------------

interface RvfStoreModule {
  isRvfAvailable: () => boolean;
  openStore: () => Promise<unknown | null>;
  closeStore: () => Promise<void>;
  getContact: (id: string) => Promise<RvfEntry | null>;
  queryStore: (
    vector: number[],
    k?: number,
    filter?: Record<string, unknown> | null
  ) => Promise<ContactSearchResult[] | null>;
  storeLength: () => Promise<number>;
  upsertMetadata: (id: string, partial: Partial<RvfMetadata>) => Promise<boolean>;
  deleteContact: (id: string) => Promise<boolean>;
  buildProfileText: (contact: Record<string, unknown>) => string;
  buildMetadata: (contact: Record<string, unknown>, url: string) => RvfMetadata;
  ingestContacts: (
    entries: { id: string; vector: number[]; metadata: RvfMetadata }[]
  ) => Promise<{ accepted: number } | null>;
  chunkArray: <T>(arr: T[], size: number) => T[][];
  RVF_PATH: string;
  DIMENSIONS: number;
}

let _store: RvfStoreModule | null = null;
let _storeLoadAttempted = false;

/**
 * Lazily load the rvf-store.mjs module. Caches the result so subsequent
 * calls are instant. Returns null if ruvector is not installed.
 */
async function getRvfStore(): Promise<RvfStoreModule | null> {
  if (_storeLoadAttempted) return _store;
  _storeLoadAttempted = true;

  try {
    // Ensure DATA_DIR env is set before the import resolves lib.mjs
    process.env.PROSPECTOR_DATA_DIR = DATA_DIR;
    const mod = await import(
      /* webpackIgnore: true */
      SCRIPTS_DIR + "/rvf-store.mjs"
    );
    _store = mod as RvfStoreModule;
    return _store;
  } catch (err) {
    console.error("[rvf-service] Failed to load rvf-store.mjs:", err);
    _store = null;
    return null;
  }
}

// ---------------------------------------------------------------------------
// Contact URL index cache (from graph.json)
// ---------------------------------------------------------------------------

let _contactUrls: string[] | null = null;
let _contactUrlsMtime: number = 0;

/**
 * Get the list of all contact URLs from graph.json. This is used as the
 * index for "list all contacts" since the VectorDB has no getAll() method.
 * Cached with mtime-based invalidation.
 */
async function getContactUrlIndex(): Promise<string[]> {
  if (_contactUrls) return _contactUrls;

  const graph = await readJsonPath<GraphData>(GRAPH_JSON_PATH);
  if (!graph?.contacts) {
    _contactUrls = [];
    return _contactUrls;
  }

  _contactUrls = Object.keys(graph.contacts);
  _contactUrlsMtime = Date.now();
  return _contactUrls;
}

/**
 * Invalidate the contact URL index cache.
 */
export function invalidateContactIndex(): void {
  _contactUrls = null;
  _contactUrlsMtime = 0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check if the RVF store (ruvector) is available.
 */
export async function isAvailable(): Promise<boolean> {
  const store = await getRvfStore();
  if (!store) return false;
  return store.isRvfAvailable();
}

/**
 * Get the total number of entries in the RVF store.
 */
export async function getContactCount(): Promise<number> {
  const store = await getRvfStore();
  if (!store) return 0;
  return store.storeLength();
}

/**
 * Get a single contact by LinkedIn profile URL (the RVF entry ID).
 */
export async function getContactById(id: string): Promise<RvfEntry | null> {
  const store = await getRvfStore();
  if (!store) return null;
  return store.getContact(id);
}

/**
 * Get a single contact by LinkedIn slug (e.g. "johndoe").
 * Tries both with and without trailing slash.
 */
export async function getContactBySlug(slug: string): Promise<RvfEntry | null> {
  if (!slug) return null;
  const store = await getRvfStore();
  if (!store) return null;

  // Try canonical URL forms
  const candidates = [
    `https://www.linkedin.com/in/${slug}`,
    `https://www.linkedin.com/in/${slug}/`,
  ];

  for (const url of candidates) {
    const entry = await store.getContact(url);
    if (entry) return entry;
  }

  return null;
}

/**
 * List contacts with sort, filter, and pagination.
 *
 * Since VectorDB has no "list all" method, we use the contact URL index
 * from graph.json and hydrate each contact's metadata from the RVF store.
 * This is acceptable because:
 * 1. The URL index is cached in memory
 * 2. Individual RVF lookups are fast (HNSW indexed)
 * 3. We only hydrate the current page, not all 5k+ contacts
 *
 * For filtering and sorting we need metadata, so we pre-load metadata for
 * the filtered set. When filter/sort requires scoring data, we batch-load
 * from graph.json contacts (which have the same scores) and only go to RVF
 * for the final page.
 */
export async function listContacts(
  params: ContactListParams = {}
): Promise<ContactListResult> {
  const {
    page = 1,
    pageSize = 50,
    sortBy = "goldScore",
    sortDir = "desc",
    tier = "all",
    cluster,
    persona,
    search,
  } = params;

  // Load graph.json contacts as the index + metadata source for sorting/filtering
  const graph = await readJsonPath<GraphData>(GRAPH_JSON_PATH);
  if (!graph?.contacts) {
    return { contacts: [], total: 0, page, pageSize, totalPages: 0 };
  }

  // Build a filtered list of [url, metadata-like object] pairs
  let entries = Object.entries(graph.contacts);

  // Filter by tier
  if (tier && tier !== "all") {
    entries = entries.filter(
      ([, c]) => c.scores?.tier === tier
    );
  }

  // Filter by cluster (check tags array which includes cluster labels)
  if (cluster) {
    entries = entries.filter(([, c]) => {
      const tags = c.tags ?? [];
      return tags.includes(cluster);
    });
  }

  // Filter by persona
  if (persona) {
    entries = entries.filter(([, c]) => c.personaType === persona);
  }

  // Text search across name, headline, currentRole, currentCompany
  if (search) {
    const q = search.toLowerCase();
    entries = entries.filter(([, c]) => {
      const fields = [
        c.name,
        c.enrichedName,
        c.headline,
        c.currentRole,
        c.currentCompany,
        c.title,
        c.location,
        c.enrichedLocation,
      ];
      return fields.some((f) => f && f.toLowerCase().includes(q));
    });
  }

  // Sort
  entries.sort(([, a], [, b]) => {
    let aVal: number | string = 0;
    let bVal: number | string = 0;

    switch (sortBy) {
      case "goldScore":
        aVal = a.scores?.goldScore ?? 0;
        bVal = b.scores?.goldScore ?? 0;
        break;
      case "icpFit":
        aVal = a.scores?.icpFit ?? 0;
        bVal = b.scores?.icpFit ?? 0;
        break;
      case "networkHub":
        aVal = a.scores?.networkHub ?? 0;
        bVal = b.scores?.networkHub ?? 0;
        break;
      case "relationshipStrength":
        aVal = a.scores?.relationshipStrength ?? 0;
        bVal = b.scores?.relationshipStrength ?? 0;
        break;
      case "behavioralScore":
        aVal = a.behavioralScore ?? 0;
        bVal = b.behavioralScore ?? 0;
        break;
      case "referralLikelihood":
        aVal = a.scores?.referralLikelihood ?? 0;
        bVal = b.scores?.referralLikelihood ?? 0;
        break;
      case "name":
        aVal = (a.enrichedName ?? a.name ?? "").toLowerCase();
        bVal = (b.enrichedName ?? b.name ?? "").toLowerCase();
        break;
      default:
        aVal = a.scores?.goldScore ?? 0;
        bVal = b.scores?.goldScore ?? 0;
    }

    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortDir === "asc"
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    }

    return sortDir === "asc"
      ? (aVal as number) - (bVal as number)
      : (bVal as number) - (aVal as number);
  });

  const total = entries.length;
  const totalPages = Math.ceil(total / pageSize);
  const offset = (page - 1) * pageSize;
  const pageEntries = entries.slice(offset, offset + pageSize);

  // Hydrate page entries with RVF metadata if available, else map from graph
  const store = await getRvfStore();
  const contacts: RvfMetadata[] = [];

  for (const [url, graphContact] of pageEntries) {
    let meta: RvfMetadata | null = null;

    if (store) {
      const rvfEntry = await store.getContact(url);
      if (rvfEntry) {
        meta = rvfEntry.metadata;
      }
    }

    if (!meta) {
      // Fallback: map graph.json contact to RvfMetadata shape
      meta = graphContactToMetadata(url, graphContact);
    }

    contacts.push(meta);
  }

  return { contacts, total, page, pageSize, totalPages };
}

/**
 * Get contacts filtered by tier.
 */
export async function getContactsByTier(
  tier: ContactTier,
  limit = 50
): Promise<RvfMetadata[]> {
  const result = await listContacts({
    tier,
    pageSize: limit,
    sortBy: "goldScore",
    sortDir: "desc",
  });
  return result.contacts;
}

/**
 * Get contacts filtered by cluster label.
 */
export async function getContactsByCluster(
  cluster: string,
  limit = 50
): Promise<RvfMetadata[]> {
  const result = await listContacts({
    cluster,
    pageSize: limit,
    sortBy: "goldScore",
    sortDir: "desc",
  });
  return result.contacts;
}

/**
 * Get the top N contacts by gold score.
 */
export async function getTopGoldContacts(limit = 20): Promise<RvfMetadata[]> {
  const result = await listContacts({
    tier: "gold",
    pageSize: limit,
    sortBy: "goldScore",
    sortDir: "desc",
  });
  return result.contacts;
}

/**
 * Compute dashboard aggregate statistics.
 * Uses graph.json for full-dataset aggregation (faster than iterating RVF).
 */
export async function getDashboardAggregates(): Promise<DashboardAggregates> {
  const graph = await readJsonPath<GraphData>(GRAPH_JSON_PATH);
  if (!graph?.contacts) {
    return {
      totalContacts: 0,
      tierCounts: { gold: 0, silver: 0, bronze: 0, watch: 0 },
      avgGoldScore: 0,
      topPersonas: [],
      topClusters: [],
      enrichedCount: 0,
      enrichedPercent: 0,
    };
  }

  const contacts = Object.values(graph.contacts);
  const total = contacts.length;

  // Tier counts
  const tierCounts: TierCounts = { gold: 0, silver: 0, bronze: 0, watch: 0 };
  let goldScoreSum = 0;
  let enrichedCount = 0;
  const personaCounts = new Map<string, number>();
  const clusterCounts = new Map<string, number>();

  for (const c of contacts) {
    const t = (c.scores?.tier ?? "watch") as ContactTier;
    if (t in tierCounts) {
      tierCounts[t]++;
    } else {
      tierCounts.watch++;
    }

    goldScoreSum += c.scores?.goldScore ?? 0;

    if (c.enriched) enrichedCount++;

    if (c.personaType) {
      personaCounts.set(c.personaType, (personaCounts.get(c.personaType) ?? 0) + 1);
    }

    // Count cluster memberships from tags
    for (const tag of c.tags ?? []) {
      clusterCounts.set(tag, (clusterCounts.get(tag) ?? 0) + 1);
    }
  }

  const topPersonas = [...personaCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([persona, count]) => ({ persona, count }));

  const topClusters = [...clusterCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([cluster, count]) => ({ cluster, count }));

  return {
    totalContacts: total,
    tierCounts,
    avgGoldScore: total > 0 ? goldScoreSum / total : 0,
    topPersonas,
    topClusters,
    enrichedCount,
    enrichedPercent: total > 0 ? (enrichedCount / total) * 100 : 0,
  };
}

/**
 * Perform a semantic (vector) search using the RVF store.
 * Requires a pre-computed query vector (384-dim).
 */
export async function searchByVector(
  vector: number[],
  k = 20,
  filter?: Record<string, unknown>
): Promise<ContactSearchResult[]> {
  const store = await getRvfStore();
  if (!store) return [];
  const results = await store.queryStore(vector, k, filter ?? null);
  return results ?? [];
}

/**
 * Update metadata for a contact in the RVF store.
 */
export async function updateContactMetadata(
  id: string,
  partial: Partial<RvfMetadata>
): Promise<boolean> {
  const store = await getRvfStore();
  if (!store) return false;
  return store.upsertMetadata(id, partial);
}

/**
 * Delete a contact from the RVF store.
 */
export async function removeContact(id: string): Promise<boolean> {
  const store = await getRvfStore();
  if (!store) return false;
  return store.deleteContact(id);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Map a graph.json contact record to the flat RvfMetadata shape.
 * Used as a fallback when RVF lookup fails or ruvector is unavailable.
 */
function graphContactToMetadata(
  url: string,
  c: GraphContact
): RvfMetadata {
  const scores = c.scores ?? ({} as GraphContact["scores"]);
  return {
    profileUrl: url,
    name: c.enrichedName ?? c.name ?? "",
    headline: c.headline ?? c.title ?? "",
    title: c.title ?? "",
    location: c.enrichedLocation ?? c.location ?? "",
    currentRole: c.currentRole ?? "",
    currentCompany: c.currentCompany ?? "",
    about: (c.about ?? "").substring(0, 300),
    connections: c.connections ?? c.connectionCount ?? "",
    mutualConnections: typeof c.mutualConnections === "number"
      ? c.mutualConnections
      : Array.isArray(c.mutualConnections)
        ? c.mutualConnections.length
        : 0,
    enriched: c.enriched ?? false,
    enrichedAt: c.enrichedAt ?? "",
    degree: c.degree ?? 1,
    discoveredVia: c.discoveredVia ?? [],
    searchTerms: c.searchTerms ?? [],
    icpFit: scores.icpFit ?? 0,
    networkHub: scores.networkHub ?? 0,
    relationshipStrength: scores.relationshipStrength ?? 0,
    signalBoost: scores.signalBoost ?? 0,
    goldScore: scores.goldScore ?? 0,
    tier: (scores.tier ?? "watch") as ContactTier,
    persona: c.personaType ?? "",
    behavioralScore: c.behavioralScore ?? 0,
    behavioralPersona: c.behavioralPersona ?? "passive-network",
    referralLikelihood: scores.referralLikelihood ?? 0,
    referralTier: c.referralTier ?? "",
    referralPersona: c.referralPersona ?? "",
    cluster: -1,
    clusterLabel: "",
    createdAt: "",
    updatedAt: "",
    embeddedAt: "",
  } as RvfMetadata;
}
