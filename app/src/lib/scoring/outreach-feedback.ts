// Feed outreach outcomes back into scoring via behavioral observations.
// When a contact replies, books a meeting, or accepts a connection,
// we record a behavioral observation and trigger a rescore.

import { query } from '@/lib/db/client';
import { triggerAutoScore } from './auto-score';

const RESCORE_EVENTS = new Set(['meeting_booked', 'accepted']);
const OBSERVATION_MAP: Record<string, string> = {
  replied: 'outreach_reply',
  meeting_booked: 'meeting_booked',
  accepted: 'connection_accepted',
};

/**
 * Process an outreach event and feed it back into the scoring system.
 * Inserts a behavioral observation for trackable events and
 * triggers a rescore for high-signal events.
 */
export async function processOutreachFeedback(
  contactId: string,
  eventType: string
): Promise<void> {
  const observationType = OBSERVATION_MAP[eventType];
  if (!observationType) return;

  // Insert behavioral observation
  await query(
    `INSERT INTO behavioral_observations (contact_id, observation_type, observation_data, observed_at)
     VALUES ($1, $2, $3, NOW())`,
    [
      contactId,
      observationType,
      JSON.stringify({ source: 'outreach', eventType }),
    ]
  );

  // Trigger rescore for high-signal events
  if (RESCORE_EVENTS.has(eventType)) {
    triggerAutoScore(contactId);
  }
}
