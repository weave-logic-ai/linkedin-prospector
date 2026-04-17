// Tests for CausalGraph service CRUD

jest.mock('@/lib/db/client', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  healthCheck: jest.fn(),
  getPool: jest.fn(),
  shutdown: jest.fn(),
}));

import { query } from '@/lib/db/client';
import * as service from '@/lib/ecc/causal-graph/service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function mockRows<T>(rows: T[]): ReturnType<typeof query> {
  return Promise.resolve({ rows, command: '', rowCount: rows.length, oid: 0, fields: [] }) as ReturnType<typeof query>;
}

describe('CausalGraph service', () => {
  beforeEach(() => mockQuery.mockReset());

  describe('createCausalNode', () => {
    it('inserts and returns a mapped node', async () => {
      mockQuery.mockReturnValueOnce(mockRows([{
        id: 'node-1', tenant_id: 'default', entity_type: 'score', entity_id: 'contact-1',
        operation: 'score_contact', inputs: { foo: 1 }, output: { bar: 2 },
        session_id: null, created_at: '2026-01-01',
      }]));

      const node = await service.createCausalNode('default', 'score', 'contact-1', 'score_contact', { foo: 1 }, { bar: 2 });
      expect(node.id).toBe('node-1');
      expect(node.entityType).toBe('score');
      expect(node.inputs).toEqual({ foo: 1 });
      expect(node.output).toEqual({ bar: 2 });
      expect(node.sessionId).toBeNull();

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/INSERT INTO causal_nodes/);
    });

    it('serializes inputs/output as JSON strings', async () => {
      mockQuery.mockReturnValueOnce(mockRows([{
        id: 'n', tenant_id: 't', entity_type: 'input', entity_id: 'dim',
        operation: 'op', inputs: {}, output: {}, session_id: 'sess-1', created_at: 'x',
      }]));

      await service.createCausalNode('t', 'input', 'dim', 'op', { a: 1 }, { b: 2 }, 'sess-1');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[4]).toBe(JSON.stringify({ a: 1 }));
      expect(params[5]).toBe(JSON.stringify({ b: 2 }));
      expect(params[6]).toBe('sess-1');
    });
  });

  describe('updateCausalNodeOutput', () => {
    it('updates the output JSON', async () => {
      mockQuery.mockReturnValueOnce(mockRows([]));
      await service.updateCausalNodeOutput('node-1', { composite: 0.7 });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/UPDATE causal_nodes SET output/);
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe(JSON.stringify({ composite: 0.7 }));
    });
  });

  describe('createCausalEdge', () => {
    it('inserts and returns a mapped edge with defaults', async () => {
      mockQuery.mockReturnValueOnce(mockRows([{
        id: 'e1', source_node_id: 'n1', target_node_id: 'n2', relation: 'caused',
        weight: 1.0, metadata: {}, created_at: '2026-01-01',
      }]));

      const edge = await service.createCausalEdge('n1', 'n2', 'caused');
      expect(edge.sourceNodeId).toBe('n1');
      expect(edge.targetNodeId).toBe('n2');
      expect(edge.relation).toBe('caused');
      expect(edge.weight).toBe(1.0);
    });
  });

  describe('batchCreateNodes', () => {
    it('returns empty array immediately when input is empty', async () => {
      const result = await service.batchCreateNodes('tenant', []);
      expect(result).toEqual([]);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('issues one INSERT with multi-value placeholders', async () => {
      mockQuery.mockReturnValueOnce(mockRows([
        { id: 'a', tenant_id: 't', entity_type: 'dimension', entity_id: 'icp_fit', operation: 'op', inputs: {}, output: {}, session_id: null, created_at: 'x' },
        { id: 'b', tenant_id: 't', entity_type: 'dimension', entity_id: 'network_hub', operation: 'op', inputs: {}, output: {}, session_id: null, created_at: 'x' },
      ]));

      const result = await service.batchCreateNodes('t', [
        { entityType: 'dimension', entityId: 'icp_fit', operation: 'op' },
        { entityType: 'dimension', entityId: 'network_hub', operation: 'op' },
      ]);
      expect(result).toHaveLength(2);
      // Only one query call
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql.match(/\(\$\d+/g)?.length).toBe(2);
    });
  });

  describe('batchCreateEdges', () => {
    it('returns empty array immediately when input is empty', async () => {
      const result = await service.batchCreateEdges([]);
      expect(result).toEqual([]);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('defaults weight to 1.0 when omitted', async () => {
      mockQuery.mockReturnValueOnce(mockRows([
        { id: 'e1', source_node_id: 'a', target_node_id: 'b', relation: 'caused', weight: 1.0, metadata: {}, created_at: 'x' },
      ]));
      await service.batchCreateEdges([{ sourceNodeId: 'a', targetNodeId: 'b', relation: 'caused' }]);
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[3]).toBe(1.0);
    });
  });

  describe('getCausalGraph', () => {
    it('returns null when no root found', async () => {
      mockQuery.mockReturnValueOnce(mockRows([]));
      const result = await service.getCausalGraph('t', 'score', 'contact-1');
      expect(result).toBeNull();
    });

    it('returns rootNode + nodes + edges when root exists', async () => {
      mockQuery.mockReturnValueOnce(mockRows([{
        id: 'root', tenant_id: 't', entity_type: 'score', entity_id: 'contact-1',
        operation: 'score', inputs: {}, output: { tier: 'gold' }, session_id: null, created_at: 'x',
      }]));
      mockQuery.mockReturnValueOnce(mockRows([
        { id: 'root', tenant_id: 't', entity_type: 'score', entity_id: 'contact-1', operation: 'score', inputs: {}, output: {}, session_id: null, created_at: 'x' },
        { id: 'dim1', tenant_id: 't', entity_type: 'dimension', entity_id: 'icp_fit', operation: 'op', inputs: {}, output: {}, session_id: null, created_at: 'x' },
      ]));
      mockQuery.mockReturnValueOnce(mockRows([
        { id: 'e1', source_node_id: 'dim1', target_node_id: 'root', relation: 'merged_into', weight: 0.2, metadata: {}, created_at: 'x' },
      ]));

      const result = await service.getCausalGraph('t', 'score', 'contact-1');
      expect(result).not.toBeNull();
      expect(result!.rootNode.id).toBe('root');
      expect(result!.nodes).toHaveLength(2);
      expect(result!.edges).toHaveLength(1);
    });
  });

  describe('getLatestTraceForContact', () => {
    it('delegates to getCausalGraph with entityType=score', async () => {
      mockQuery.mockReturnValueOnce(mockRows([])); // root lookup returns nothing
      const result = await service.getLatestTraceForContact('t', 'contact-1');
      expect(result).toBeNull();
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/entity_type = \$2/);
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[1]).toBe('score');
    });
  });
});
