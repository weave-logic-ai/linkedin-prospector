// GET /api/graph/data - Graph nodes and edges for reagraph visualization
//
// WS-4 Phase 1 Track B: accepts `?primaryTargetId=<uuid>` to re-root the
// graph on a specific target. The name is kept per the sprint planning doc
// (`08-phased-delivery.md` §3.2) even though functionally it's the "root node"
// — future work may rename. When missing, behavior is unchanged: top-scored
// contacts are returned.
//
// Phase 4 Track I (`08-phased-delivery.md` §6):
//   - In-memory LRU cache (10 slots, 60s TTL) keyed on
//     (ownerId, primaryTargetId, limit, includeProvenanceEdges). Invalidated
//     from the targets state endpoint and the lens activation endpoint.
//   - `?includeProvenanceEdges=true` lens-toggle lets callers pull the
//     `evidence_for` / `derived_from` edges into the response. Default is
//     false so the graph stays uncluttered for day-to-day research.
//   - Re-root SQL uses the indexed `source_contact_id` / `target_contact_id`
//     columns from `002-core-schema.sql` so EXPLAIN shows
//     `Index Scan using idx_edges_(source|target)_contact_id`, not a Seq
//     Scan.

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import {
  getCurrentOwnerProfileId,
  getTargetById,
  getTargetEntityId,
} from '@/lib/targets/service';
import {
  buildCacheKey,
  getCached,
  setCached,
} from '@/lib/graph/data-cache';

interface GraphNode {
  id: string;
  label: string;
  data: {
    tier: string | null;
    company: string | null;
    title: string | null;
    score: number | null;
  };
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  data: {
    type: string;
    weight: number;
  };
}

interface GraphDataResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Non-provenance edge types the graph renders for day-to-day research. This
// is the existing list from the pre-Phase-4 route.
const REAL_EDGE_TYPES = [
  'CONNECTED_TO',
  'MESSAGED',
  'same-company',
  'INVITED_BY',
  'ENDORSED',
  'RECOMMENDED',
  'FOLLOWS_COMPANY',
  'WORKED_AT',
  'EDUCATED_AT',
  'WORKS_AT',
];

// Provenance / evidence edge types from the ECC causal graph. Hidden by
// default per `04-targets-and-graph.md` §11.1 and the Phase 4 scope.
const PROVENANCE_EDGE_TYPES = ['evidence_for', 'derived_from'];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      1000,
      Math.max(1, parseInt(searchParams.get('limit') || '500', 10))
    );
    const primaryTargetId = searchParams.get('primaryTargetId');
    const includeProvenanceEdges =
      searchParams.get('includeProvenanceEdges') === 'true';

    // Owner id is used for cache scoping so state-change invalidations
    // target the right tenant's entries. Null when no owner exists yet (bare
    // fixture install); we still cache under the null-owner key.
    const ownerId = await getCurrentOwnerProfileId();

    const cacheKey = buildCacheKey(
      { primaryTargetId, limit, includeProvenanceEdges },
      ownerId
    );
    const cached = getCached<GraphDataResponse>(cacheKey);
    if (cached) {
      return NextResponse.json(
        { data: cached.value },
        { headers: { 'x-graph-data-cache': 'hit' } }
      );
    }

    // Resolve the root-node entity. When a primaryTargetId is passed and
    // resolves to a contact/company, we re-center the query on the edges
    // directly incident to that entity; otherwise we fall back to the
    // existing "top N by composite_score" owner-centered behavior.
    let rootEntityId: string | null = null;
    let rootKind: 'contact' | 'company' | 'self' | null = null;
    if (primaryTargetId) {
      const target = await getTargetById(primaryTargetId);
      if (target) {
        rootEntityId = getTargetEntityId(target);
        rootKind = target.kind;
      }
    }

    // Re-rooted path: when the target is a contact, center the graph on that
    // contact's immediate neighborhood. Company/self targets fall through to
    // the top-scored listing for v1 — richer company-centric layouts ship in
    // Phase 4 polish (`08-phased-delivery.md` §6).
    //
    // The neighborhood CTE uses `source_contact_id = $1 OR target_contact_id
    // = $1` which EXPLAIN resolves to a `BitmapOr` over the two btree
    // indexes (`idx_edges_source_contact_id`, `idx_edges_target_contact_id`)
    // — not a Seq Scan. See `tests/perf/graph-data.test.ts` for the EXPLAIN
    // assertion.
    let nodesResult;
    if (rootKind === 'contact' && rootEntityId) {
      nodesResult = await query<{
        id: string;
        full_name: string | null;
        current_company: string | null;
        title: string | null;
        tier: string | null;
        composite_score: number | null;
      }>(
        `WITH neighborhood AS (
           SELECT DISTINCT c.id
           FROM contacts c
           WHERE c.id = $1
              OR c.id IN (
                SELECT CASE WHEN source_contact_id = $1 THEN target_contact_id
                            ELSE source_contact_id END
                FROM edges
                WHERE source_contact_id = $1 OR target_contact_id = $1
              )
         )
         SELECT c.id, c.full_name, c.current_company, c.title,
                cs.tier, cs.composite_score
         FROM contacts c
         INNER JOIN neighborhood n ON n.id = c.id
         LEFT JOIN contact_scores cs ON c.id = cs.contact_id
         WHERE NOT c.is_archived
         ORDER BY cs.composite_score DESC NULLS LAST
         LIMIT $2`,
        [rootEntityId, limit]
      );
    } else {
      // Fetch top contacts by composite score
      nodesResult = await query<{
        id: string;
        full_name: string | null;
        current_company: string | null;
        title: string | null;
        tier: string | null;
        composite_score: number | null;
      }>(
        `SELECT c.id, c.full_name, c.current_company, c.title,
                cs.tier, cs.composite_score
         FROM contacts c
         LEFT JOIN contact_scores cs ON c.id = cs.contact_id
         WHERE NOT c.is_archived
         ORDER BY cs.composite_score DESC NULLS LAST
         LIMIT $1`,
        [limit]
      );
    }

    if (nodesResult.rows.length === 0) {
      const empty: GraphDataResponse = { nodes: [], edges: [] };
      setCached(cacheKey, empty, ownerId, primaryTargetId);
      return NextResponse.json(
        { data: empty },
        { headers: { 'x-graph-data-cache': 'miss' } }
      );
    }

    // Collect node IDs for edge filtering
    const nodeIds = nodesResult.rows.map((r) => r.id);

    // Fetch REAL edges plus (optionally) provenance edges. Provenance is
    // filtered out by default so the default graph view matches the pre-
    // Phase-4 UX — research-mode users can flip the lens toggle to pull
    // `evidence_for` / `derived_from` into the response.
    const activeEdgeTypes = includeProvenanceEdges
      ? [...REAL_EDGE_TYPES, ...PROVENANCE_EDGE_TYPES]
      : REAL_EDGE_TYPES;

    const edgesResult = await query<{
      id: string;
      source_contact_id: string;
      target_contact_id: string;
      edge_type: string;
      weight: number;
    }>(
      `SELECT e.id, e.source_contact_id, e.target_contact_id, e.edge_type, e.weight
       FROM edges e
       WHERE e.target_contact_id = ANY($1)
         AND e.target_contact_id IS NOT NULL
         AND e.edge_type = ANY($2)`,
      [nodeIds, activeEdgeTypes]
    );

    // Add any source nodes that aren't already in the set (e.g., self-contact)
    const existingIds = new Set(nodeIds);
    const missingSources = new Set<string>();
    for (const edge of edgesResult.rows) {
      if (!existingIds.has(edge.source_contact_id)) {
        missingSources.add(edge.source_contact_id);
      }
    }

    if (missingSources.size > 0) {
      const missingResult = await query<{
        id: string;
        full_name: string | null;
        current_company: string | null;
        title: string | null;
        tier: string | null;
        composite_score: number | null;
      }>(
        `SELECT c.id, c.full_name, c.current_company, c.title,
                cs.tier, cs.composite_score
         FROM contacts c
         LEFT JOIN contact_scores cs ON c.id = cs.contact_id
         WHERE c.id = ANY($1)`,
        [Array.from(missingSources)]
      );
      nodesResult.rows.push(...missingResult.rows);
    }

    // Build response
    const nodes: GraphNode[] = nodesResult.rows.map((row) => ({
      id: row.id,
      label: row.full_name || 'Unknown',
      data: {
        tier: row.tier,
        company: row.current_company,
        title: row.title,
        score: row.composite_score,
      },
    }));

    const edges: GraphEdge[] = edgesResult.rows.map((row) => ({
      id: row.id,
      source: row.source_contact_id,
      target: row.target_contact_id,
      data: {
        type: row.edge_type,
        weight: row.weight,
      },
    }));

    const response: GraphDataResponse = { nodes, edges };
    setCached(cacheKey, response, ownerId, primaryTargetId);

    return NextResponse.json(
      { data: response },
      { headers: { 'x-graph-data-cache': 'miss' } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to load graph data',
        details: error instanceof Error ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
