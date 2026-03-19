// POST /api/outreach/campaigns/:id/populate - auto-populate campaign with matching contacts

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { getCampaign } from '@/lib/db/queries/outreach';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PopulateFilters {
  tiers?: string[];
  personas?: string[];
  referralPersonas?: string[];
  nicheId?: string;
  icpId?: string;
  minScore?: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: 'Invalid campaign ID' }, { status: 400 });
  }

  try {
    // Verify campaign exists
    const campaign = await getCampaign(id);
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const body = await request.json();
    const filters: PopulateFilters = body.filters ?? {};
    const limit = Math.min(body.limit ?? 100, 500);

    // Build dynamic query for matching contacts
    const conditions: string[] = ['c.is_archived = FALSE'];
    const params_arr: unknown[] = [];
    let idx = 1;

    // Always join contact_scores
    const joins: string[] = [
      'JOIN contact_scores cs ON cs.contact_id = c.id',
    ];

    if (filters.tiers && filters.tiers.length > 0) {
      conditions.push(`cs.tier = ANY($${idx++})`);
      params_arr.push(filters.tiers);
    }

    if (filters.personas && filters.personas.length > 0) {
      conditions.push(`cs.persona = ANY($${idx++})`);
      params_arr.push(filters.personas);
    }

    if (filters.referralPersonas && filters.referralPersonas.length > 0) {
      conditions.push(`cs.referral_persona = ANY($${idx++})`);
      params_arr.push(filters.referralPersonas);
    }

    if (filters.minScore != null) {
      conditions.push(`cs.composite_score >= $${idx++}`);
      params_arr.push(filters.minScore);
    }

    if (filters.icpId && UUID_REGEX.test(filters.icpId)) {
      joins.push(`JOIN contact_icp_fits cif ON cif.contact_id = c.id AND cif.icp_profile_id = $${idx++}`);
      params_arr.push(filters.icpId);
    }

    // Exclude contacts already in ANY campaign
    conditions.push(
      `NOT EXISTS (SELECT 1 FROM outreach_states os WHERE os.contact_id = c.id)`
    );

    params_arr.push(limit);

    const sql = `
      SELECT c.id, c.full_name, cs.tier
      FROM contacts c
      ${joins.join('\n')}
      WHERE ${conditions.join(' AND ')}
      ORDER BY cs.composite_score DESC
      LIMIT $${idx++}
    `;

    const matchResult = await query<{ id: string; full_name: string; tier: string }>(sql, params_arr);

    let added = 0;
    let skipped = 0;
    const contacts: Array<{ id: string; name: string; tier: string }> = [];

    for (const row of matchResult.rows) {
      try {
        await query(
          `INSERT INTO outreach_states (contact_id, campaign_id, state, last_action_at)
           VALUES ($1, $2, 'queued', NOW())
           ON CONFLICT (contact_id, campaign_id) DO NOTHING`,
          [row.id, id]
        );
        added++;
        contacts.push({ id: row.id, name: row.full_name, tier: row.tier });
      } catch {
        skipped++;
      }
    }

    return NextResponse.json({ added, skipped, contacts });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to populate campaign', details: error instanceof Error ? error.message : undefined },
      { status: 500 }
    );
  }
}
