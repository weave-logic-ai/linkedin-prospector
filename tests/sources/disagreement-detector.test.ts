// Disagreement detector — ADR-030 + ADR-032 behavior pinning.
//
// Covers:
//   1. No rows → null winner, no conflict.
//   2. Single value across multiple sources → winner returned, no conflict.
//   3. Three sources, two distinct values → conflict flagged and the
//      higher-weight value wins.
//   4. Weight tie → break on source count, then referenced_date.
//   5. Override with no sources → pinnedByUser, winner is override,
//      hasConflict=false.
//   6. Override matches one of two source-value groups → hasConflict stays
//      true (the dissenting group still disagrees).
//   7. Override disagrees with every source → hasConflict=true with
//      pinnedByUser=true (the banner reads "Overridden by you").

jest.mock('@/lib/db/client', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  healthCheck: jest.fn(),
  getPool: jest.fn(),
  shutdown: jest.fn(),
}));

import {
  detectFieldDisagreement,
  groupByValue,
  normalizeFieldValue,
} from '@/lib/sources/disagreement-detector';
import { query } from '@/lib/db/client';

type QueryMock = jest.MockedFunction<typeof query>;

function mockRows<T>(rows: T[]) {
  return Promise.resolve({
    rows,
    rowCount: rows.length,
    fields: [],
    command: '',
    oid: 0,
  });
}

function sfvRow(partial: Partial<{
  source_record_id: string;
  source_type: string;
  canonical_url: string;
  title: string;
  field_value: unknown;
  final_weight: number;
  referenced_date: string | null;
}>) {
  return {
    source_record_id: 'sr-?',
    source_type: 'linkedin',
    canonical_url: 'https://example.com',
    title: null,
    field_value: 'unset',
    final_weight: 1.0,
    referenced_date: null,
    ...partial,
  };
}

/**
 * Build a mock that routes override + SFV queries to two different fixture
 * tables. The detector issues two SELECTs; we distinguish them by a
 * substring of the SQL text.
 */
function mockDetectorReads(
  overrideRows: Array<Record<string, unknown>>,
  sfvRows: Array<Record<string, unknown>>
) {
  const mock = query as QueryMock;
  mock.mockImplementation((sql: unknown) => {
    const text = String(sql);
    if (text.includes('FROM source_field_overrides')) {
      return mockRows(overrideRows) as ReturnType<typeof query>;
    }
    if (text.includes('FROM source_field_values')) {
      return mockRows(sfvRows) as ReturnType<typeof query>;
    }
    return mockRows([]) as ReturnType<typeof query>;
  });
}

describe('sources/disagreement-detector', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('groupByValue', () => {
    it('groups identical strings case-insensitively', () => {
      const groups = groupByValue([
        sfvRow({ source_record_id: 'a', field_value: 'VP Engineering', final_weight: 1.2 }),
        sfvRow({ source_record_id: 'b', field_value: 'vp engineering', final_weight: 1.0 }),
      ]);
      expect(groups).toHaveLength(1);
      expect(groups[0].weightSum).toBeCloseTo(2.2, 5);
      expect(groups[0].sources).toHaveLength(2);
    });

    it('orders groups by weightSum descending', () => {
      const groups = groupByValue([
        sfvRow({ source_record_id: 'a', field_value: 'Low', final_weight: 0.5 }),
        sfvRow({ source_record_id: 'b', field_value: 'High', final_weight: 1.4 }),
      ]);
      expect(groups[0].value).toBe('High');
      expect(groups[1].value).toBe('Low');
    });

    it('breaks ties by source count', () => {
      const groups = groupByValue([
        sfvRow({ source_record_id: 'a', field_value: 'A', final_weight: 1.0 }),
        sfvRow({ source_record_id: 'b', field_value: 'A', final_weight: 0.5 }),
        sfvRow({ source_record_id: 'c', field_value: 'B', final_weight: 1.5 }),
      ]);
      // Both groups sum to 1.5; "A" has 2 sources and wins.
      expect(groups[0].value).toBe('A');
    });

    it('normalizes JSON values deterministically', () => {
      const a = normalizeFieldValue({ x: 1, y: 2 });
      const b = normalizeFieldValue({ x: 1, y: 2 });
      expect(a).toBe(b);
    });
  });

  describe('detectFieldDisagreement', () => {
    const common = {
      tenantId: 't',
      entityKind: 'contact' as const,
      entityId: 'c-1',
      fieldName: 'title',
    };

    it('returns null winner when no data', async () => {
      mockDetectorReads([], []);
      const r = await detectFieldDisagreement(common);
      expect(r.winner).toBeNull();
      expect(r.hasConflict).toBe(false);
      expect(r.pinnedByUser).toBe(false);
    });

    it('single value across multiple sources: winner, no conflict', async () => {
      mockDetectorReads([], [
        sfvRow({ source_record_id: 'a', source_type: 'edgar', field_value: 'VP Eng', final_weight: 1.4 }),
        sfvRow({ source_record_id: 'b', source_type: 'linkedin', field_value: 'VP Eng', final_weight: 1.0 }),
      ]);
      const r = await detectFieldDisagreement(common);
      expect(r.hasConflict).toBe(false);
      expect(r.winner?.value).toBe('VP Eng');
      expect(r.winner?.sources).toHaveLength(2);
    });

    it('three-source conflict — higher-weight value wins, conflict flagged', async () => {
      mockDetectorReads([], [
        sfvRow({ source_record_id: 'edgar-1', source_type: 'edgar', field_value: 'VP, Technology', final_weight: 1.4 }),
        sfvRow({ source_record_id: 'pr-1', source_type: 'press_release', field_value: 'VP Engineering', final_weight: 1.2 }),
        sfvRow({ source_record_id: 'li-1', source_type: 'linkedin', field_value: 'VP Engineering', final_weight: 1.0 }),
      ]);
      const r = await detectFieldDisagreement(common);
      expect(r.hasConflict).toBe(true);
      // VP Engineering has sum 2.2 vs VP, Technology 1.4 → it wins.
      expect(r.winner?.value).toBe('VP Engineering');
      expect(r.candidates).toHaveLength(2);
      expect(r.candidates[0].value).toBe('VP Engineering');
      expect(r.candidates[1].value).toBe('VP, Technology');
    });

    it('tie-breaks on referenced_date when weights+counts are equal', async () => {
      mockDetectorReads([], [
        sfvRow({ source_record_id: 'a', field_value: 'Old', final_weight: 1.0, referenced_date: '2020-01-01' }),
        sfvRow({ source_record_id: 'b', field_value: 'New', final_weight: 1.0, referenced_date: '2024-01-01' }),
      ]);
      const r = await detectFieldDisagreement(common);
      expect(r.hasConflict).toBe(true);
      expect(r.winner?.value).toBe('New');
    });

    it('override with no sources: pinnedByUser, hasConflict=false', async () => {
      mockDetectorReads(
        [{ value: 'Founder', set_at: '2024-01-01', set_by_user_id: null }],
        []
      );
      const r = await detectFieldDisagreement(common);
      expect(r.pinnedByUser).toBe(true);
      expect(r.winner?.value).toBe('Founder');
      expect(r.hasConflict).toBe(false);
    });

    it('override agrees with one source, dissents from another: conflict flagged', async () => {
      mockDetectorReads(
        [{ value: 'Founder', set_at: '2024-01-01', set_by_user_id: null }],
        [
          sfvRow({ source_record_id: 'a', source_type: 'linkedin', field_value: 'Founder', final_weight: 1.0 }),
          sfvRow({ source_record_id: 'b', source_type: 'edgar', field_value: 'CEO', final_weight: 1.4 }),
        ]
      );
      const r = await detectFieldDisagreement(common);
      expect(r.pinnedByUser).toBe(true);
      expect(r.winner?.value).toBe('Founder');
      // Winner carries the agreeing source attribution.
      expect(r.winner?.sources).toHaveLength(1);
      expect(r.winner?.sources[0].sourceType).toBe('linkedin');
      // The dissenting group remains in candidates.
      expect(r.candidates.find((c) => c.value === 'CEO')).toBeDefined();
      expect(r.hasConflict).toBe(true);
    });

    it('override disagrees with all sources: pinnedByUser + hasConflict', async () => {
      mockDetectorReads(
        [{ value: 'Stealth Founder', set_at: '2024-01-01', set_by_user_id: null }],
        [
          sfvRow({ source_record_id: 'a', source_type: 'linkedin', field_value: 'VP Eng', final_weight: 1.0 }),
        ]
      );
      const r = await detectFieldDisagreement(common);
      expect(r.pinnedByUser).toBe(true);
      expect(r.winner?.value).toBe('Stealth Founder');
      expect(r.hasConflict).toBe(true);
    });
  });
});
