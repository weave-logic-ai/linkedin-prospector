// GET /api/graph/data - Graph nodes and edges for reagraph visualization
//
// WS-4 Phase 1 Track B: accepts `?primaryTargetId=<uuid>` to re-root the
// graph on a specific target. The name is kept per the sprint planning doc
// (`08-phased-delivery.md` §3.2) even though functionally it's the "root node"
// — future work may rename. When missing, behavior is unchanged: top-scored
// contacts are returned.

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { getTargetById, getTargetEntityId } from '@/lib/targets/service';

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(1000, Math.max(1, parseInt(searchParams.get('limit') || '500', 10)));
    const primaryTargetId = searchParams.get('primaryTargetId');

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
      return NextResponse.json({ data: { nodes: [], edges: [] } });
    }

    // Collect node IDs for edge filtering
    const nodeIds = nodesResult.rows.map((r) => r.id);

    // Fetch REAL edges only (exclude synthetic mutual-proximity and same-cluster)
    const REAL_EDGE_TYPES = ['CONNECTED_TO', 'MESSAGED', 'same-company', 'INVITED_BY', 'ENDORSED', 'RECOMMENDED', 'FOLLOWS_COMPANY', 'WORKED_AT', 'EDUCATED_AT', 'WORKS_AT'];

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
      [nodeIds, REAL_EDGE_TYPES]
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

    return NextResponse.json({ data: response });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to load graph data', details: error instanceof Error ? error.message : undefined },
      { status: 500 }
    );
  }
}
