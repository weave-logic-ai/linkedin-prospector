// CrossRef service tests

jest.mock('@/lib/db/client', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  healthCheck: jest.fn(),
  getPool: jest.fn(),
  shutdown: jest.fn(),
}));

import { query } from '@/lib/db/client';
import * as crossRefService from '@/lib/ecc/cross-refs/service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function mockRows<T>(rows: T[]): ReturnType<typeof query> {
  return Promise.resolve({ rows, command: '', rowCount: rows.length, oid: 0, fields: [] }) as ReturnType<typeof query>;
}

function crossRefRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'cr-1', tenant_id: 't', edge_id: 'edge-1',
    relation_type: 'co_worker', context: { company: 'Acme' },
    confidence: 0.85, source: 'enrichment:clearbit',
    source_entity_id: null, bidirectional: true,
    created_at: 'x', updated_at: 'x',
    ...overrides,
  };
}

describe('CrossRef service', () => {
  beforeEach(() => mockQuery.mockReset());

  describe('createCrossRef', () => {
    it('inserts with ON CONFLICT upsert and maps result', async () => {
      mockQuery.mockReturnValueOnce(mockRows([crossRefRow()]));
      const result = await crossRefService.createCrossRef({
        tenantId: 't', edgeId: 'edge-1', relationType: 'co_worker',
        context: { company: 'Acme' }, confidence: 0.85, source: 'enrichment:clearbit',
      });

      expect(result.id).toBe('cr-1');
      expect(result.relationType).toBe('co_worker');
      expect(result.confidence).toBe(0.85);

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/ON CONFLICT/);
    });

    it('defaults confidence to 0.5 and bidirectional=true', async () => {
      mockQuery.mockReturnValueOnce(mockRows([crossRefRow({ confidence: 0.5 })]));
      await crossRefService.createCrossRef({
        tenantId: 't', edgeId: 'edge-1', relationType: 'mutual_connection',
        source: 'inference',
      });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[4]).toBe(0.5); // confidence
      expect(params[7]).toBe(true); // bidirectional
    });
  });

  describe('batchCreateCrossRefs', () => {
    it('caps at 50 entries', async () => {
      mockQuery.mockImplementation(() => mockRows([crossRefRow()]));
      const refs = Array.from({ length: 60 }).map((_, i) => ({
        tenantId: 't', edgeId: `edge-${i}`, relationType: 'co_worker' as const,
        source: 'enrichment:test',
      }));
      const results = await crossRefService.batchCreateCrossRefs(refs);
      expect(results.length).toBeLessThanOrEqual(50);
      expect(mockQuery).toHaveBeenCalledTimes(50);
    });

    it('skips failures silently', async () => {
      mockQuery
        .mockReturnValueOnce(mockRows([crossRefRow({ id: 'ok-1' })]))
        .mockRejectedValueOnce(new Error('edge missing'))
        .mockReturnValueOnce(mockRows([crossRefRow({ id: 'ok-2' })]));

      const results = await crossRefService.batchCreateCrossRefs([
        { tenantId: 't', edgeId: 'e1', relationType: 'co_worker', source: 's' },
        { tenantId: 't', edgeId: 'bad', relationType: 'co_worker', source: 's' },
        { tenantId: 't', edgeId: 'e2', relationType: 'co_worker', source: 's' },
      ]);
      expect(results).toHaveLength(2);
      expect(results.map(r => r.id)).toEqual(['ok-1', 'ok-2']);
    });
  });

  describe('getCrossRefsForEdge', () => {
    it('returns rows ordered by confidence desc', async () => {
      mockQuery.mockReturnValueOnce(mockRows([
        crossRefRow({ id: 'high', confidence: 0.9 }),
        crossRefRow({ id: 'low', confidence: 0.3 }),
      ]));
      const result = await crossRefService.getCrossRefsForEdge('edge-1');
      expect(result[0].confidence).toBe(0.9);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/ORDER BY confidence DESC/);
    });
  });

  describe('getCrossRefsForContact', () => {
    it('returns enriched rows with source/target contact ids', async () => {
      mockQuery.mockReturnValueOnce(mockRows([{
        ...crossRefRow(),
        source_id: 'contact-a',
        target_id: 'contact-b',
      }]));
      const result = await crossRefService.getCrossRefsForContact('t', 'contact-a');
      expect(result).toHaveLength(1);
      expect(result[0].sourceContactId).toBe('contact-a');
      expect(result[0].targetContactId).toBe('contact-b');
    });

    it('filters by relationType when provided', async () => {
      mockQuery.mockReturnValueOnce(mockRows([]));
      await crossRefService.getCrossRefsForContact('t', 'contact-a', 'referrer');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/cr\.relation_type = \$3/);
    });
  });

  describe('queryCrossRefsByType', () => {
    it('lists refs for a tenant + type with a LIMIT clause', async () => {
      mockQuery.mockReturnValueOnce(mockRows([crossRefRow({ relation_type: 'referrer' })]));
      const result = await crossRefService.queryCrossRefsByType('t', 'referrer', 25);
      expect(result).toHaveLength(1);
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[1]).toBe('referrer');
      expect(params[2]).toBe(25);
    });
  });

  describe('deleteCrossRef', () => {
    it('returns true when a row is deleted', async () => {
      mockQuery.mockReturnValueOnce(mockRows([{ id: 'cr-1' }]));
      expect(await crossRefService.deleteCrossRef('cr-1')).toBe(true);
    });
    it('returns false when no row matched', async () => {
      mockQuery.mockReturnValueOnce(mockRows([]));
      expect(await crossRefService.deleteCrossRef('missing')).toBe(false);
    });
  });
});
