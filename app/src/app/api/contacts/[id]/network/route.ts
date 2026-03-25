// GET /api/contacts/[id]/network — Mutual contacts, 2nd degree, same-company

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/client";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface NetworkContact {
  id: string;
  fullName: string | null;
  headline: string | null;
  title: string | null;
  currentCompany: string | null;
  profileImageUrl: string | null;
  linkedinUrl: string;
  tier: string | null;
  score: number | null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!UUID_REGEX.test(id)) {
    return NextResponse.json(
      { error: "Invalid contact ID format" },
      { status: 400 }
    );
  }

  try {
    // Find the owner contact (degree=0)
    const ownerRes = await query<{ id: string }>(
      `SELECT id FROM contacts WHERE degree = 0 AND is_archived = FALSE LIMIT 1`
    );
    const ownerId = ownerRes.rows[0]?.id;

    // Get edge count for this contact (real edges only)
    const edgeResult = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM edges
       WHERE (source_contact_id = $1 OR target_contact_id = $1)
         AND target_contact_id IS NOT NULL
         AND edge_type NOT IN ('mutual-proximity', 'same-cluster')`,
      [id]
    );
    const edgeCount = parseInt(edgeResult.rows[0].count, 10);

    // Mutual connections: contacts connected to BOTH owner and this contact
    let mutualContacts: NetworkContact[] = [];
    if (ownerId) {
      const mutualResult = await query<{
        id: string;
        full_name: string | null;
        headline: string | null;
        title: string | null;
        current_company: string | null;
        profile_image_url: string | null;
        linkedin_url: string;
        tier: string | null;
        composite_score: number | null;
      }>(
        `SELECT DISTINCT c2.id, c2.full_name, c2.headline, c2.title,
                c2.current_company, c2.profile_image_url, c2.linkedin_url,
                c2.tier, c2.composite_score
         FROM edges e1
         JOIN edges e2 ON e2.target_contact_id = e1.target_contact_id
         JOIN contacts c2 ON c2.id = e1.target_contact_id
         WHERE e1.source_contact_id = $1
           AND e2.source_contact_id = $2
           AND e1.edge_type IN ('CONNECTED_TO','same-company','MESSAGED')
           AND e2.edge_type IN ('CONNECTED_TO','same-company','MESSAGED')
           AND c2.id != $1 AND c2.id != $2
           AND c2.is_archived = FALSE
         ORDER BY c2.composite_score DESC NULLS LAST
         LIMIT 50`,
        [ownerId, id]
      );
      mutualContacts = mutualResult.rows.map(mapContact);
    }

    // 2nd degree: contacts connected to this contact but NOT directly to owner
    let secondDegree: NetworkContact[] = [];
    if (ownerId) {
      const secondRes = await query<{
        id: string;
        full_name: string | null;
        headline: string | null;
        title: string | null;
        current_company: string | null;
        profile_image_url: string | null;
        linkedin_url: string;
        tier: string | null;
        composite_score: number | null;
      }>(
        `SELECT c2.id, c2.full_name, c2.headline, c2.title,
                c2.current_company, c2.profile_image_url, c2.linkedin_url,
                c2.tier, c2.composite_score
         FROM edges e
         JOIN contacts c2 ON c2.id = e.target_contact_id
         WHERE e.source_contact_id = $1
           AND e.edge_type IN ('CONNECTED_TO','same-company')
           AND NOT EXISTS (
             SELECT 1 FROM edges e2
             WHERE e2.source_contact_id = $2 AND e2.target_contact_id = c2.id
               AND e2.edge_type IN ('CONNECTED_TO','same-company')
           )
           AND c2.id != $2
           AND c2.is_archived = FALSE
         ORDER BY c2.composite_score DESC NULLS LAST
         LIMIT 50`,
        [id, ownerId]
      );
      secondDegree = secondRes.rows.map(mapContact);
    }

    // Same-company contacts
    const companyResult = await query<{
      id: string;
      full_name: string | null;
      headline: string | null;
      title: string | null;
      current_company: string | null;
      profile_image_url: string | null;
      linkedin_url: string;
      tier: string | null;
      composite_score: number | null;
    }>(
      `SELECT c2.id, c2.full_name, c2.headline, c2.title,
              c2.current_company, c2.profile_image_url, c2.linkedin_url,
              c2.tier, c2.composite_score
       FROM contacts c1
       JOIN contacts c2 ON c2.current_company = c1.current_company
         AND c2.id != c1.id
         AND c2.is_archived = FALSE
       WHERE c1.id = $1
         AND c1.current_company IS NOT NULL
         AND c1.current_company != ''
       ORDER BY c2.full_name
       LIMIT 20`,
      [id]
    );

    return NextResponse.json({
      data: {
        mutualConnections: mutualContacts,
        secondDegree,
        sameCompany: companyResult.rows.map(mapContact),
        edgeCount,
        stats: {
          mutualCount: mutualContacts.length,
          secondDegreeCount: secondDegree.length,
          sameCompanyCount: companyResult.rows.length,
        },
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to get network data",
        details: error instanceof Error ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

function mapContact(row: {
  id: string;
  full_name: string | null;
  headline: string | null;
  title: string | null;
  current_company: string | null;
  profile_image_url: string | null;
  linkedin_url: string;
  tier: string | null;
  composite_score: number | null;
}): NetworkContact {
  return {
    id: row.id,
    fullName: row.full_name,
    headline: row.headline,
    title: row.title,
    currentCompany: row.current_company,
    profileImageUrl: row.profile_image_url,
    linkedinUrl: row.linkedin_url,
    tier: row.tier,
    score: row.composite_score,
  };
}
