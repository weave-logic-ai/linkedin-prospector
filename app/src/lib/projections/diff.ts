// Projection diff engine — WS-2 Phase 2 Track D.
// Given two Projection objects of the same shape, return the added / removed
// / changed fields. Pure; no DB, no IO.
//
// Per `02-visibility-and-feedback.md` §§4.2, 8 and Track D acceptance:
//   - added   : field was null/absent before, is present after  (green)
//   - removed : field was present before, is null/absent after  (strike)
//   - changed : field value differs, both sides present         (old → new)
//   - equal   : excluded from the changes list; counted as unchanged
//
// The diff is intentionally shallow: projections are flat maps of scalars.
// Array-valued fields (none in v1 projections) would need LCS handling; we
// do not synthesize those here.

import type {
  Projection,
  ProjectionDiffChange,
  EntityKind,
  ProjectionDiff,
} from './types';

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}

/**
 * Compare two projections field-by-field. `before` may be null (first
 * capture of the entity — everything becomes an "added" change).
 */
export function diffProjections<P extends Projection>(
  before: P | null,
  after: P
): { changes: ProjectionDiffChange[]; unchangedFieldCount: number } {
  const changes: ProjectionDiffChange[] = [];
  let unchanged = 0;

  // Keys are drawn from `after` first so we keep a stable order per projection
  // shape. Additional keys only present on `before` (rare — schema skew) are
  // appended.
  const keys = new Set<string>(Object.keys(after));
  if (before) for (const k of Object.keys(before)) keys.add(k);

  const orderedKeys = Array.from(keys);
  orderedKeys.sort();

  for (const k of orderedKeys) {
    const a = (after as unknown as Record<string, unknown>)[k];
    const b = before
      ? (before as unknown as Record<string, unknown>)[k]
      : undefined;

    const beforeEmpty = before === null || isEmpty(b);
    const afterEmpty = isEmpty(a);

    if (beforeEmpty && afterEmpty) {
      unchanged++;
      continue;
    }
    if (beforeEmpty && !afterEmpty) {
      changes.push({ field: k, kind: 'added', before: null, after: a });
      continue;
    }
    if (!beforeEmpty && afterEmpty) {
      changes.push({ field: k, kind: 'removed', before: b, after: null });
      continue;
    }
    // Both present — compare.
    if (a === b) {
      unchanged++;
      continue;
    }
    // Deep-ish equality for simple scalars; projections only hold scalars
    // today. If this ever gains arrays / objects, upgrade to a structural
    // compare.
    if (typeof a === 'number' && typeof b === 'number' && a === b) {
      unchanged++;
      continue;
    }
    changes.push({ field: k, kind: 'changed', before: b, after: a });
  }

  // Ordering per WS-2 §8: added > removed > changed, alpha within each kind.
  changes.sort((x, y) => {
    const order = { added: 0, removed: 1, changed: 2 } as const;
    if (order[x.kind] !== order[y.kind]) return order[x.kind] - order[y.kind];
    return x.field.localeCompare(y.field);
  });

  return { changes, unchangedFieldCount: unchanged };
}

export function buildProjectionDiff<P extends Projection>(args: {
  entityKind: EntityKind;
  entityId: string;
  fromCaptureId: string | null;
  toCaptureId: string;
  before: P | null;
  after: P;
}): ProjectionDiff {
  const { changes, unchangedFieldCount } = diffProjections(args.before, args.after);
  return {
    entityKind: args.entityKind,
    entityId: args.entityId,
    fromCaptureId: args.fromCaptureId,
    toCaptureId: args.toCaptureId,
    changes,
    unchangedFieldCount,
  };
}
