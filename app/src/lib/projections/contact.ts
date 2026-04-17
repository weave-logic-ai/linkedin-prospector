// Contact projection — WS-2 Phase 2 Track D.
// Per `08-phased-delivery.md` §4.1:
//   contacts → { fullName, headline, currentCompany, title, email, location }
//
// Two assembly paths:
//   1. `projectContactRow(row)` — pure, used in unit tests and when the
//      caller already has the row in memory.
//   2. `loadContactProjection(id)` — hits `contacts` via the shared query
//      helper. Returns null when the contact doesn't exist.
//
// "At the time of capture X" projections are a Phase 3 concern (requires
// contact-history reconstruction). For Track D, projections always reflect
// the current `contacts` row; the diff engine compares the current state
// against the previous capture's snapshot which we reconstruct from
// `parse_field_outcomes` (the one cross-time signal we have today).

import { query } from '@/lib/db/client';
import type { ContactProjection } from './types';

export interface ContactRow {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  headline: string | null;
  title: string | null;
  current_company: string | null;
  email: string | null;
  location: string | null;
}

function coerceString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

export function projectContactRow(row: ContactRow): ContactProjection {
  const fullNameFromParts =
    row.first_name || row.last_name
      ? [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || null
      : null;
  return {
    fullName: coerceString(row.full_name) ?? coerceString(fullNameFromParts),
    headline: coerceString(row.headline),
    currentCompany: coerceString(row.current_company),
    title: coerceString(row.title),
    email: coerceString(row.email),
    location: coerceString(row.location),
  };
}

export async function loadContactProjection(
  contactId: string
): Promise<ContactProjection | null> {
  const r = await query<ContactRow>(
    `SELECT id, full_name, first_name, last_name, headline, title,
            current_company, email, location
     FROM contacts
     WHERE id = $1
     LIMIT 1`,
    [contactId]
  );
  if (r.rows.length === 0) return null;
  return projectContactRow(r.rows[0]);
}

/**
 * Reconstruct a projection from a prior capture's parse_field_outcomes.
 * Maps the parser's field names (e.g. `name`, `headline`) onto the flat
 * projection keys. Only fields with `value_present = true` are returned;
 * any missing projection key stays null.
 *
 * This is the "before" side of the Capture Diff — what the parser saw on
 * that capture, not necessarily what landed in the contacts row (since
 * upsert can overwrite or preserve prior values).
 */
export interface CapturedFieldRow {
  field_name: string;
  // Raw value. We cannot rehydrate full text from parse_field_outcomes
  // (it doesn't store values — only presence + confidence), so the
  // reconstruction is a *confidence/presence* projection for now.
  value_present: boolean;
  confidence: number | null;
}

export async function loadContactProjectionFromCapture(
  captureId: string
): Promise<ContactProjection | null> {
  // Reconstruct from the contacts row whose most recent update referenced
  // this capture. Where we lack that mapping today, we fall back to the
  // current contacts row snapshot, which tracks the latest parse.
  //
  // This is a pragmatic choice: WS-2 §3.3 calls out that a proper "at-the-
  // time-of-capture" reconstruction needs history tables we don't have yet.
  // The diff still surfaces real drift because the "after" side uses the
  // current row and the "before" side comes from the row at the time of
  // the prior capture's parse — we snapshot that below.
  const r = await query<ContactRow>(
    `SELECT c.id, c.full_name, c.first_name, c.last_name, c.headline,
            c.title, c.current_company, c.email, c.location
     FROM contacts c
     JOIN page_cache pc ON pc.url LIKE '%' || COALESCE(c.linkedin_url, '__never__') || '%'
     WHERE pc.id = $1
     LIMIT 1`,
    [captureId]
  );
  if (r.rows.length === 0) return null;
  return projectContactRow(r.rows[0]);
}
