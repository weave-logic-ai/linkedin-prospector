// Handler: campaign_enroller
//
// Contract (unchanged, do not alter — parallel test agent depends on this shape):
//   executeCampaignEnroller(impulse: Impulse, config: Record<string, unknown>)
//     => Promise<Record<string, unknown>>
//
// Behavior:
//   1. Resolve a target campaign_id:
//      a. If config.campaign_id is set, use it directly (explicit routing).
//      b. Otherwise, resolve by matching the impulse payload (tier, persona, or
//         niche name) against active outreach_campaigns. Matching is done via a
//         case-insensitive LIKE on name/description since outreach_campaigns has
//         no dedicated targeting columns and we are explicitly forbidden from
//         adding migrations.
//   2. If no campaign resolves, insert a 'skipped' impulse_acks row is already
//      recorded by the dispatcher on our return value; we return
//      { enrolled: false, reason: 'no_match' } without throwing. (Dispatcher
//      treats non-throwing return as success ack; the 'reason' field carries
//      the no-match signal to the ack row.)
//   3. Enforce dedup: outreach_states has UNIQUE(contact_id, campaign_id). If a
//      row already exists, return { enrolled: false, reason: 'already_enrolled' }.
//   4. Otherwise insert an outreach_states row with state='not_started',
//      current_step=0. We deliberately do not select a sequence_id because the
//      outreach runner picks the active sequence for the campaign at dispatch
//      time.
//
// Deferred branches (documented for transparency):
//   - sequence_id auto-selection: deferred — no single-sequence-per-campaign
//     invariant in schema, and picking one here would pre-bind behavior that
//     belongs to the outreach runner.
//   - webhook-triggered enrollments: deferred — webhook handler is separate.

import { query } from '../../../db/client';
import type { Impulse } from '../../types';

interface CampaignRow {
  id: string;
  name: string;
}

export async function executeCampaignEnroller(
  impulse: Impulse,
  config: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const contactId = impulse.sourceEntityId;

  // --- 1. Resolve target campaign --------------------------------------------
  let campaignId = typeof config.campaign_id === 'string' ? config.campaign_id : undefined;
  let matchedBy: 'config' | 'tier' | 'persona' | 'niche' | null = campaignId ? 'config' : null;

  if (!campaignId) {
    const candidate = await resolveCampaignFromImpulse(impulse);
    if (candidate) {
      campaignId = candidate.id;
      matchedBy = candidate.matchedBy;
    }
  }

  if (!campaignId) {
    return {
      enrolled: false,
      reason: 'no_match',
      impulseType: impulse.impulseType,
      contactId,
    };
  }

  // --- 2. Dedup check --------------------------------------------------------
  const existing = await query<{ id: string }>(
    `SELECT id FROM outreach_states
     WHERE contact_id = $1 AND campaign_id = $2
     LIMIT 1`,
    [contactId, campaignId]
  );

  if (existing.rows.length > 0) {
    return {
      enrolled: false,
      reason: 'already_enrolled',
      campaignId,
      contactId,
      outreachStateId: existing.rows[0].id,
    };
  }

  // --- 3. Insert enrollment --------------------------------------------------
  // state='not_started' is the only legal initial value per CHECK constraint
  // in data/db/init/006-outreach-schema.sql. current_step starts at 0.
  try {
    const inserted = await query<{ id: string }>(
      `INSERT INTO outreach_states (contact_id, campaign_id, state, current_step, next_action_at)
       VALUES ($1, $2, 'not_started', 0, NOW())
       RETURNING id`,
      [contactId, campaignId]
    );

    return {
      enrolled: true,
      campaignId,
      contactId,
      outreachStateId: inserted.rows[0]?.id,
      matchedBy: matchedBy ?? 'config',
    };
  } catch (err) {
    // Likely a race on the UNIQUE(contact_id, campaign_id) constraint — treat
    // as already_enrolled rather than failing the handler.
    const message = err instanceof Error ? err.message : 'unknown';
    if (/unique|duplicate/i.test(message)) {
      return {
        enrolled: false,
        reason: 'already_enrolled',
        campaignId,
        contactId,
        raceDetected: true,
      };
    }
    throw err;
  }
}

/**
 * Pick an active campaign whose name or description matches a signal from the
 * impulse payload. Returns null if no match.
 *
 * Matching priority:
 *   1. tier_changed → payload.to  (e.g. 'gold' → campaigns mentioning 'gold')
 *   2. persona_assigned → payload.to
 *   3. score_computed → payload.tier, then payload.niche
 *   4. enrichment_complete / contact_created → payload.niche if present
 *
 * We use a LIKE match scoped to status='active' to avoid enrolling into
 * draft/archived campaigns.
 */
async function resolveCampaignFromImpulse(
  impulse: Impulse
): Promise<{ id: string; matchedBy: 'tier' | 'persona' | 'niche' } | null> {
  const payload = impulse.payload;
  const candidates: Array<{ term: string; matchedBy: 'tier' | 'persona' | 'niche' }> = [];

  switch (impulse.impulseType) {
    case 'tier_changed': {
      const to = payload.to;
      if (typeof to === 'string' && to.length > 0) {
        candidates.push({ term: to, matchedBy: 'tier' });
      }
      break;
    }
    case 'persona_assigned': {
      const to = payload.to;
      if (typeof to === 'string' && to.length > 0) {
        candidates.push({ term: to, matchedBy: 'persona' });
      }
      break;
    }
    case 'score_computed': {
      if (typeof payload.tier === 'string' && payload.tier.length > 0) {
        candidates.push({ term: payload.tier, matchedBy: 'tier' });
      }
      if (typeof payload.niche === 'string' && payload.niche.length > 0) {
        candidates.push({ term: payload.niche, matchedBy: 'niche' });
      }
      break;
    }
    default: {
      if (typeof payload.niche === 'string' && payload.niche.length > 0) {
        candidates.push({ term: payload.niche, matchedBy: 'niche' });
      }
      break;
    }
  }

  for (const { term, matchedBy } of candidates) {
    const pattern = `%${term}%`;
    const result = await query<CampaignRow>(
      `SELECT id, name
       FROM outreach_campaigns
       WHERE status = 'active'
         AND (name ILIKE $1 OR description ILIKE $1)
       ORDER BY updated_at DESC
       LIMIT 1`,
      [pattern]
    );
    if (result.rows.length > 0) {
      return { id: result.rows[0].id, matchedBy };
    }
  }

  return null;
}
