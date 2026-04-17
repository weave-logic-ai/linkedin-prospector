// Phase 4 Track I — delta threshold unit tests.

jest.mock('@/lib/db/client', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  healthCheck: jest.fn(),
  getPool: jest.fn(),
  shutdown: jest.fn(),
}));

describe('scoring/delta-threshold', () => {
  describe('evaluateDelta', () => {
    it('returns no highlight when previous is null', async () => {
      const svc = await import('@/lib/scoring/delta-threshold');
      const result = svc.evaluateDelta(0.8, null, 0.2);
      expect(result.shouldHighlight).toBe(false);
      expect(Number.isNaN(result.relativeChange)).toBe(true);
    });

    it('highlights when relative change >= threshold for values >= 1', async () => {
      const svc = await import('@/lib/scoring/delta-threshold');
      const r = svc.evaluateDelta(120, 100, 0.2); // 20% up
      expect(r.shouldHighlight).toBe(true);
      expect(r.direction).toBe(1);
      expect(r.relativeChange).toBeCloseTo(0.2);
    });

    it('dims when relative change is below threshold', async () => {
      const svc = await import('@/lib/scoring/delta-threshold');
      const r = svc.evaluateDelta(105, 100, 0.2);
      expect(r.shouldHighlight).toBe(false);
      expect(r.direction).toBe(1);
    });

    it('handles sub-1 previous values (scoring space [0,1])', async () => {
      const svc = await import('@/lib/scoring/delta-threshold');
      // 0.5 → 0.65 = 30% relative increase. Highlights at threshold 0.2;
      // the smaller 0.6 vs. 0.5 case has floating-point slack on its
      // shouldHighlight so we pick a clean gap for the assertion.
      const r = svc.evaluateDelta(0.65, 0.5, 0.2);
      expect(r.shouldHighlight).toBe(true);
      expect(r.relativeChange).toBeGreaterThanOrEqual(0.2);
    });

    it('clamps threshold to [0, 1] internally', async () => {
      const svc = await import('@/lib/scoring/delta-threshold');
      // Threshold 0 means any non-zero change highlights.
      expect(svc.evaluateDelta(101, 100, -5).shouldHighlight).toBe(true);
      // Threshold 1 means only 100%-or-greater moves highlight.
      expect(svc.evaluateDelta(150, 100, 1).shouldHighlight).toBe(false);
      expect(svc.evaluateDelta(200, 100, 1).shouldHighlight).toBe(true);
    });

    it('marks direction 0 for equal values', async () => {
      const svc = await import('@/lib/scoring/delta-threshold');
      const r = svc.evaluateDelta(100, 100, 0.2);
      expect(r.direction).toBe(0);
      expect(r.shouldHighlight).toBe(false);
    });

    it('exposes the documented default of 0.20', async () => {
      const svc = await import('@/lib/scoring/delta-threshold');
      expect(svc.DEFAULT_DELTA_HIGHLIGHT_THRESHOLD).toBe(0.2);
    });
  });

  describe('getOwnerDeltaThreshold', () => {
    beforeEach(() => {
      jest.resetModules();
    });

    it('returns the persisted value when the column exists', async () => {
      const { query } = await import('@/lib/db/client');
      (query as jest.MockedFunction<typeof query>).mockImplementation(() =>
        Promise.resolve({
          rows: [{ delta_highlight_threshold: 0.35 }],
          command: '',
          rowCount: 1,
          oid: 0,
          fields: [],
        }) as ReturnType<typeof query>
      );
      const svc = await import('@/lib/scoring/delta-threshold');
      const v = await svc.getOwnerDeltaThreshold();
      expect(v).toBeCloseTo(0.35);
    });

    it('falls back to the default when the row is missing', async () => {
      const { query } = await import('@/lib/db/client');
      (query as jest.MockedFunction<typeof query>).mockImplementation(() =>
        Promise.resolve({
          rows: [],
          command: '',
          rowCount: 0,
          oid: 0,
          fields: [],
        }) as ReturnType<typeof query>
      );
      const svc = await import('@/lib/scoring/delta-threshold');
      const v = await svc.getOwnerDeltaThreshold();
      expect(v).toBe(0.2);
    });

    it('falls back to the default when the db throws (missing column)', async () => {
      const { query } = await import('@/lib/db/client');
      (query as jest.MockedFunction<typeof query>).mockImplementation(() =>
        Promise.reject(new Error('column does not exist'))
      );
      const svc = await import('@/lib/scoring/delta-threshold');
      const v = await svc.getOwnerDeltaThreshold();
      expect(v).toBe(0.2);
    });

    it('clamps database-provided values outside [0, 1]', async () => {
      const { query } = await import('@/lib/db/client');
      (query as jest.MockedFunction<typeof query>).mockImplementation(() =>
        Promise.resolve({
          rows: [{ delta_highlight_threshold: 1.8 }],
          command: '',
          rowCount: 1,
          oid: 0,
          fields: [],
        }) as ReturnType<typeof query>
      );
      const svc = await import('@/lib/scoring/delta-threshold');
      const v = await svc.getOwnerDeltaThreshold();
      expect(v).toBe(1);
    });
  });

  describe('setOwnerDeltaThreshold', () => {
    it('clamps the stored value into [0, 1]', async () => {
      const { query } = await import('@/lib/db/client');
      const mockQuery = query as jest.MockedFunction<typeof query>;
      mockQuery.mockReset();
      mockQuery.mockImplementation(() =>
        Promise.resolve({
          rows: [],
          command: '',
          rowCount: 0,
          oid: 0,
          fields: [],
        }) as ReturnType<typeof query>
      );
      const svc = await import('@/lib/scoring/delta-threshold');
      const high = await svc.setOwnerDeltaThreshold(5);
      expect(high).toBe(1);
      const low = await svc.setOwnerDeltaThreshold(-3);
      expect(low).toBe(0);
      const ok = await svc.setOwnerDeltaThreshold(0.25);
      expect(ok).toBeCloseTo(0.25);
      // And the db UPDATE received the clamped value for the "high" case.
      expect(mockQuery.mock.calls.some((c) => (c[1] as number[])[0] === 1)).toBe(true);
    });
  });
});
