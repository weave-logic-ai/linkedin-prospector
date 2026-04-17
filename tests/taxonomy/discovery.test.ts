// Tests for ICP discovery de-duplication

jest.mock('@/lib/db/client', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  healthCheck: jest.fn(),
  getPool: jest.fn(),
  shutdown: jest.fn(),
}));

import { query } from '@/lib/db/client';
import { saveDiscoveredIcp, computeCriteriaOverlap } from '@/lib/taxonomy/discovery';
import type { DiscoveredIcp } from '@/lib/taxonomy/types';

const mockQuery = query as jest.MockedFunction<typeof query>;

function mockRows<T>(rows: T[]): ReturnType<typeof query> {
  return Promise.resolve({ rows, command: '', rowCount: rows.length, oid: 0, fields: [] }) as ReturnType<typeof query>;
}

function makeDiscovery(overrides: Partial<DiscoveredIcp> = {}): DiscoveredIcp {
  return {
    suggestedName: 'VP Engineering at SaaS',
    description: 'Engineering leaders at SaaS companies',
    criteria: {
      titlePatterns: ['VP Engineering', 'VP Eng'],
      industries: ['Technology'],
      companySizes: ['51-200'],
      locations: ['San Francisco'],
    },
    contactCount: 12,
    sampleContactIds: [],
    confidence: 0.8,
    ...overrides,
  };
}

describe('computeCriteriaOverlap', () => {
  it('returns 1.0 for identical criteria', () => {
    const a = { roles: ['CTO'], industries: ['Tech'] };
    const b = { roles: ['CTO'], industries: ['Tech'] };
    expect(computeCriteriaOverlap(a, b)).toBeCloseTo(1.0, 5);
  });

  it('returns 0.0 for completely disjoint criteria', () => {
    const a = { roles: ['CTO'] };
    const b = { roles: ['CMO'] };
    expect(computeCriteriaOverlap(a, b)).toBe(0);
  });

  it('ignores fields that are empty on both sides', () => {
    const a = { roles: ['CTO'] };
    const b = { roles: ['CTO'] };
    // Only one populated field; must average 1.0 not diluted by empty ones.
    expect(computeCriteriaOverlap(a, b)).toBe(1);
  });

  it('is case-insensitive for string matching', () => {
    const a = { roles: ['cto', 'VP Eng'] };
    const b = { roles: ['CTO', 'vp eng'] };
    expect(computeCriteriaOverlap(a, b)).toBe(1);
  });

  it('handles non-array field values gracefully', () => {
    const a = { roles: 'not-an-array' };
    const b = { roles: ['CTO'] };
    // normalizeArray returns [] when non-array, resulting in 0 overlap.
    expect(computeCriteriaOverlap(a, b)).toBe(0);
  });

  it('computes partial overlap with jaccard semantics', () => {
    const a = { roles: ['A', 'B', 'C'] };
    const b = { roles: ['B', 'C', 'D'] };
    // intersection 2, union 4 → 0.5
    expect(computeCriteriaOverlap(a, b)).toBeCloseTo(0.5, 5);
  });
});

describe('saveDiscoveredIcp', () => {
  beforeEach(() => mockQuery.mockReset());

  it('skips with duplicate_name when name exists in the niche', async () => {
    // Name check returns a hit.
    mockQuery.mockReturnValueOnce(mockRows([{ id: 'existing-icp' }]));

    const result = await saveDiscoveredIcp(makeDiscovery(), 'niche-1');

    expect(result.action).toBe('skipped');
    expect(result.reason).toBe('duplicate_name');
    expect(result.existingId).toBe('existing-icp');
    // Should stop at name check; no INSERT.
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('skips with criteria_overlap when existing ICP criteria overlap > 0.8', async () => {
    // Name check: no match
    mockQuery.mockReturnValueOnce(mockRows([]));
    // Existing ICPs with very similar criteria
    mockQuery.mockReturnValueOnce(mockRows([{
      id: 'similar-icp',
      criteria: {
        roles: ['VP Engineering', 'VP Eng'],
        industries: ['Technology'],
        companySizeRanges: ['51-200'],
        locations: ['San Francisco'],
      },
    }]));

    const result = await saveDiscoveredIcp(makeDiscovery(), 'niche-1');

    expect(result.action).toBe('skipped');
    expect(result.reason).toBe('criteria_overlap');
    expect(result.existingId).toBe('similar-icp');
    expect(result.overlap).toBeGreaterThan(0.8);
  });

  it('creates when no name match and no criteria overlap', async () => {
    mockQuery.mockReturnValueOnce(mockRows([])); // name check
    mockQuery.mockReturnValueOnce(mockRows([])); // existing ICPs
    mockQuery.mockReturnValueOnce(mockRows([{ id: 'new-icp-id' }])); // insert

    const result = await saveDiscoveredIcp(makeDiscovery(), 'niche-1');

    expect(result.action).toBe('created');
    expect(result.id).toBe('new-icp-id');

    // Verify INSERT was called with the right shape
    const insertCall = mockQuery.mock.calls[2];
    expect(insertCall[0]).toMatch(/INSERT INTO icp_profiles/);
    const insertParams = insertCall[1] as unknown[];
    const criteriaJson = JSON.parse(insertParams[2] as string);
    expect(criteriaJson.roles).toEqual(['VP Engineering', 'VP Eng']);
    expect(insertParams[3]).toBe('niche-1');
  });

  it('handles null nicheId via IS NULL branch and still creates when no collision', async () => {
    mockQuery.mockReturnValueOnce(mockRows([])); // name check with IS NULL
    mockQuery.mockReturnValueOnce(mockRows([])); // existing ICPs (IS NULL)
    mockQuery.mockReturnValueOnce(mockRows([{ id: 'new-icp' }])); // insert

    const result = await saveDiscoveredIcp(makeDiscovery(), null);

    expect(result.action).toBe('created');
    // The first two queries should have used IS NULL branches
    expect(mockQuery.mock.calls[0][0]).toMatch(/niche_id IS NULL/);
    expect(mockQuery.mock.calls[1][0]).toMatch(/niche_id IS NULL/);
  });
});
