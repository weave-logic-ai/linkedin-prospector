// Analytics event writer — WS-2 Phase 2 Track D.
// Per `08-phased-delivery.md` §4.1 (analytics events) and
// `02-visibility-and-feedback.md` §11.
//
// Writes to the `analytics_events` table (migration 040). Best-effort: a DB
// failure must never break the caller. Gated on
// `RESEARCH_FLAGS.parserTelemetry` — the flag that scopes the entire WS-2
// visibility feature; when it is off, the sidebar panels don't render and
// therefore no events would fire anyway, but we belt-and-brace here too.

import { query } from '@/lib/db/client';
import { RESEARCH_FLAGS } from '@/lib/config/research-flags';

/**
 * Canonical event names for WS-2 Track D. Additional events may be added
 * over time; keep them snake_case (enforced by the DB CHECK constraint).
 */
export type AnalyticsEventName =
  | 'parse_panel_viewed'
  | 'capture_diff_opened'
  | 'unmatched_flagged'
  | 'regression_run';

export interface AnalyticsEvent {
  event: AnalyticsEventName | (string & {});
  properties?: Record<string, unknown>;
  userId?: string | null;
}

export interface AnalyticsWriteResult {
  attempted: boolean;
  written: boolean;
  reason?: 'flag-off' | 'no-tenant' | 'db-error' | 'invalid-event';
}

const EVENT_RE = /^[a-z][a-z0-9_]*$/;

async function resolveTenantId(): Promise<string | null> {
  try {
    const r = await query<{ tid: string | null }>(
      `SELECT get_current_tenant_id()::text AS tid`
    );
    return r.rows[0]?.tid ?? null;
  } catch {
    return null;
  }
}

/**
 * Record one product-analytics event. Safe to call from anywhere on the
 * server; swallows all errors.
 */
export async function recordEvent(
  evt: AnalyticsEvent
): Promise<AnalyticsWriteResult> {
  if (!RESEARCH_FLAGS.parserTelemetry) {
    return { attempted: false, written: false, reason: 'flag-off' };
  }
  if (!evt.event || !EVENT_RE.test(evt.event)) {
    return { attempted: false, written: false, reason: 'invalid-event' };
  }

  const tenantId = await resolveTenantId();
  if (!tenantId) {
    return { attempted: true, written: false, reason: 'no-tenant' };
  }

  try {
    await query(
      `INSERT INTO analytics_events (tenant_id, user_id, event, properties)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [
        tenantId,
        evt.userId ?? null,
        evt.event,
        JSON.stringify(evt.properties ?? {}),
      ]
    );
    return { attempted: true, written: true };
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(
        '[analytics] insert failed; swallowing:',
        (err as Error).message
      );
    }
    return { attempted: true, written: false, reason: 'db-error' };
  }
}
