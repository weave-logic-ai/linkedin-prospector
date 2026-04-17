// Source disagreement detector.
//
// For a given target entity (contact or company) + field, walk
// `source_records` + `source_field_values` and report whether sources
// disagree — plus the weight-resolved winner and any active user override.
//
// Behavior map (ADR-030 + ADR-032, `05-source-expansion.md` §§13.2, 13.4):
//   1. If a `source_field_overrides` row exists with cleared_at IS NULL, the
//      override value is the winner with `pinnedByUser: true`. We still
//      report any source disagreement alongside so the banner can surface
//      "Overridden by you — review sources."
//   2. Otherwise, group `source_field_values.field_value` by normalized
//      string equality and sum `final_weight` per group. Highest total
//      wins; ties break on (a) source count, (b) most recent `referenced_date`.
//   3. `hasConflict` is true iff the raw group count is > 1 OR the override
//      disagrees with at least one source value.
//
// No external deps; this module is pure TS + the db client.

import { query } from '../db/client';

export interface DisagreementSource {
  sourceRecordId: string;
  sourceType: string;
  canonicalUrl: string | null;
  title: string | null;
  finalWeight: number;
  referencedDate: string | null;
}

export interface DisagreementWinner {
  /** Normalized string form — always present, even for the override path. */
  value: string;
  weightSum: number;
  sources: DisagreementSource[];
}

export interface DisagreementResult {
  entityKind: 'contact' | 'company';
  entityId: string;
  fieldName: string;
  /** true when multiple distinct values are observed OR an override
   *  disagrees with a source value. */
  hasConflict: boolean;
  /** True when a user override is active. Populated independently of
   *  `hasConflict`. */
  pinnedByUser: boolean;
  /** Winner of the weight resolution (or the pinned override).
   *  `null` only when no data AND no override exists. */
  winner: DisagreementWinner | null;
  /** All candidate values grouped by normalized equality, ordered by
   *  descending weightSum. The pinned override, when set, appears first
   *  regardless of its weight. */
  candidates: DisagreementWinner[];
}

export interface DetectorInput {
  tenantId: string;
  entityKind: 'contact' | 'company';
  entityId: string;
  fieldName: string;
}

interface SfvRow {
  source_record_id: string;
  source_type: string;
  canonical_url: string | null;
  title: string | null;
  field_value: unknown;
  final_weight: number;
  referenced_date: string | null;
}

interface OverrideRow {
  value: string;
  set_at: string;
  set_by_user_id: string | null;
}

/**
 * Normalize an arbitrary JSONB value to a display string. The detector
 * groups by normalized equality — "VP Engineering" and "vp engineering "
 * collapse. Strict equality on complex JSON is JSON-stringify fallback.
 */
export function normalizeFieldValue(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'string') return raw.trim().toLowerCase();
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  return JSON.stringify(raw);
}

/**
 * Display string: preserve case and whitespace for the UI.
 */
export function displayFieldValue(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  return JSON.stringify(raw);
}

/**
 * Group a set of source-field rows by normalized value equality. Each
 * group's `weightSum` is the sum of `final_weight`; ordering is descending
 * by weight, tie-broken by source count and most recent referenced_date.
 */
export function groupByValue(rows: SfvRow[]): DisagreementWinner[] {
  const byKey = new Map<string, {
    display: string;
    sources: DisagreementSource[];
    weightSum: number;
    newest: string;
  }>();
  for (const r of rows) {
    const key = normalizeFieldValue(r.field_value);
    const display = displayFieldValue(r.field_value);
    const bucket = byKey.get(key) ?? {
      display,
      sources: [],
      weightSum: 0,
      newest: '',
    };
    // Prefer the first seen non-empty display for the value.
    if (!bucket.display && display) bucket.display = display;
    bucket.sources.push({
      sourceRecordId: r.source_record_id,
      sourceType: r.source_type,
      canonicalUrl: r.canonical_url,
      title: r.title,
      finalWeight: Number(r.final_weight) || 0,
      referencedDate: r.referenced_date,
    });
    bucket.weightSum += Number(r.final_weight) || 0;
    if (r.referenced_date && r.referenced_date > bucket.newest) {
      bucket.newest = r.referenced_date;
    }
    byKey.set(key, bucket);
  }
  const groups = Array.from(byKey.values());
  groups.sort((a, b) => {
    if (b.weightSum !== a.weightSum) return b.weightSum - a.weightSum;
    if (b.sources.length !== a.sources.length) return b.sources.length - a.sources.length;
    if (a.newest < b.newest) return 1;
    if (a.newest > b.newest) return -1;
    return 0;
  });
  return groups.map((g) => ({
    value: g.display,
    weightSum: Number(g.weightSum.toFixed(4)),
    sources: g.sources,
  }));
}

/**
 * Run the full detector for a single field. Reads:
 *   - `source_field_overrides` (active row for the entity+field)
 *   - `source_field_values` joined to `source_records` for the entity+field
 *
 * Exposes the grouping logic via `groupByValue` for unit tests.
 */
export async function detectFieldDisagreement(
  input: DetectorInput
): Promise<DisagreementResult> {
  const overrideRes = await query<OverrideRow>(
    `SELECT value, set_at, set_by_user_id
       FROM source_field_overrides
      WHERE tenant_id = $1
        AND entity_kind = $2
        AND entity_id = $3
        AND field_name = $4
        AND cleared_at IS NULL
      ORDER BY set_at DESC
      LIMIT 1`,
    [input.tenantId, input.entityKind, input.entityId, input.fieldName]
  );
  const override = overrideRes.rows[0] ?? null;

  const sfvRes = await query<SfvRow>(
    `SELECT sfv.source_record_id,
            sr.source_type,
            sr.canonical_url,
            sr.title,
            sfv.field_value,
            sfv.final_weight,
            sfv.referenced_date::text AS referenced_date
       FROM source_field_values sfv
       JOIN source_records sr ON sr.id = sfv.source_record_id
      WHERE sfv.tenant_id = $1
        AND sfv.subject_kind = $2
        AND sfv.subject_id = $3
        AND sfv.field_name = $4
      ORDER BY sfv.final_weight DESC`,
    [input.tenantId, input.entityKind, input.entityId, input.fieldName]
  );

  const groups = groupByValue(sfvRes.rows);

  if (override) {
    const overrideKey = normalizeFieldValue(override.value);
    const overrideWinner: DisagreementWinner = {
      value: override.value,
      weightSum: 0,
      sources: [],
    };
    // Move any matching group under the override winner so callers can
    // see which sources back it. The remaining `groups` are, by definition,
    // every source-attested value that disagrees with the pinned override.
    const matchIdx = groups.findIndex(
      (g) => normalizeFieldValue(g.value) === overrideKey
    );
    if (matchIdx >= 0) {
      overrideWinner.weightSum = groups[matchIdx].weightSum;
      overrideWinner.sources = groups[matchIdx].sources;
      groups.splice(matchIdx, 1);
    }
    const candidates = [overrideWinner, ...groups];
    // Per ADR-032: any dissenting source (group that does not match the
    // override) raises the banner. If every source agrees with the override
    // there is no conflict; if only the override exists (no sources at all)
    // there is no conflict.
    const hasConflict = groups.length > 0;
    return {
      entityKind: input.entityKind,
      entityId: input.entityId,
      fieldName: input.fieldName,
      hasConflict,
      pinnedByUser: true,
      winner: overrideWinner,
      candidates,
    };
  }

  const winner = groups[0] ?? null;
  const hasConflict = groups.length > 1;
  return {
    entityKind: input.entityKind,
    entityId: input.entityId,
    fieldName: input.fieldName,
    hasConflict,
    pinnedByUser: false,
    winner,
    candidates: groups,
  };
}

/**
 * Convenience: run the detector for a list of fields on one entity,
 * returning a keyed map. This is the shape the
 * `/api/targets/[id]/field-conflicts` route returns.
 */
export async function detectFieldConflictsForEntity(
  tenantId: string,
  entityKind: 'contact' | 'company',
  entityId: string,
  fieldNames: string[]
): Promise<Record<string, DisagreementResult>> {
  const out: Record<string, DisagreementResult> = {};
  for (const fieldName of fieldNames) {
    out[fieldName] = await detectFieldDisagreement({
      tenantId,
      entityKind,
      entityId,
      fieldName,
    });
  }
  return out;
}
