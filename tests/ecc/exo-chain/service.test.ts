// ExoChain service tests (append, get, verify)

jest.mock('@/lib/db/client', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  healthCheck: jest.fn(),
  getPool: jest.fn(),
  shutdown: jest.fn(),
}));

import { query } from '@/lib/db/client';
import { appendChainEntry, getChain, verifyChain } from '@/lib/ecc/exo-chain/service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function mockRows<T>(rows: T[]): ReturnType<typeof query> {
  return Promise.resolve({ rows, command: '', rowCount: rows.length, oid: 0, fields: [] }) as ReturnType<typeof query>;
}

// Helper: mimic an exo_chain_entries row. prev_hash / entry_hash stored as BYTEA
// (pg returns Buffer). Test row returns Buffer.from(hex, 'hex').
function rowFor(entry: {
  id: string; tenantId: string; chainId: string; sequence: number;
  prevHashHex: string | null; entryHashHex: string;
  operation: string; data: Record<string, unknown>; actor: string; createdAt: string;
}) {
  return {
    id: entry.id,
    tenant_id: entry.tenantId,
    chain_id: entry.chainId,
    sequence: entry.sequence,
    prev_hash: entry.prevHashHex ? Buffer.from(entry.prevHashHex, 'hex') : null,
    entry_hash: Buffer.from(entry.entryHashHex, 'hex'),
    operation: entry.operation,
    data: entry.data,
    actor: entry.actor,
    created_at: entry.createdAt,
  };
}

describe('appendChainEntry', () => {
  beforeEach(() => mockQuery.mockReset());

  it('inserts an entry, computes a hash, and returns the mapped entry + hash', async () => {
    // Capture inserted hashes at call time so the mocked return matches.
    mockQuery.mockImplementationOnce((sql: unknown, params?: unknown[]) => {
      expect(String(sql)).toMatch(/INSERT INTO exo_chain_entries/);
      const entryHashBytes = (params as unknown[])[4] as Buffer;
      const hexHash = entryHashBytes.toString('hex');
      return mockRows([{
        id: 'entry-1', tenant_id: 'default', chain_id: 'chain-1', sequence: 0,
        prev_hash: null, entry_hash: entryHashBytes,
        operation: 'budget_check', data: { ok: true }, actor: 'system', created_at: '2026-01-01',
      }]) as unknown as ReturnType<typeof query> & { _hex: string } extends infer T ? T : ReturnType<typeof query>;
    });

    const result = await appendChainEntry('default', 'chain-1', 0, null, 'budget_check', { ok: true });
    expect(result.entry.sequence).toBe(0);
    expect(result.entry.chainId).toBe('chain-1');
    expect(result.entry.prevHash).toBeNull();
    expect(result.entryHash).toMatch(/^[0-9a-f]+$/);
    expect(result.entry.entryHash).toBe(result.entryHash);
  });

  it('converts prev_hash hex to Buffer for BYTEA storage', async () => {
    const prevHex = 'ab'.repeat(16);
    mockQuery.mockImplementationOnce((_sql: unknown, params?: unknown[]) => {
      // prev_hash is the 4th positional arg (index 3)
      const prevHashBuf = (params as unknown[])[3] as Buffer;
      expect(Buffer.isBuffer(prevHashBuf)).toBe(true);
      expect(prevHashBuf.toString('hex')).toBe(prevHex);
      const entryHashBytes = (params as unknown[])[4] as Buffer;
      return mockRows([{
        id: 'e2', tenant_id: 't', chain_id: 'c', sequence: 1,
        prev_hash: prevHashBuf, entry_hash: entryHashBytes,
        operation: 'enrich_result', data: {}, actor: 'system', created_at: '2026-01-02',
      }]) as unknown as ReturnType<typeof query>;
    });

    const result = await appendChainEntry('t', 'c', 1, prevHex, 'enrich_result', {});
    expect(result.entry.prevHash).toBe(prevHex);
  });
});

describe('getChain', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns entries ordered by sequence', async () => {
    mockQuery.mockReturnValueOnce(mockRows([
      rowFor({ id: 'a', tenantId: 't', chainId: 'c', sequence: 0, prevHashHex: null, entryHashHex: 'aa'.repeat(16), operation: 'budget_check', data: {}, actor: 'system', createdAt: '2026-01-01' }),
      rowFor({ id: 'b', tenantId: 't', chainId: 'c', sequence: 1, prevHashHex: 'aa'.repeat(16), entryHashHex: 'bb'.repeat(16), operation: 'enrich_result', data: {}, actor: 'system', createdAt: '2026-01-02' }),
    ]));

    const entries = await getChain('c');
    expect(entries).toHaveLength(2);
    expect(entries[0].sequence).toBe(0);
    expect(entries[0].prevHash).toBeNull();
    expect(entries[1].prevHash).toBe('aa'.repeat(16));
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toMatch(/ORDER BY sequence/);
  });
});

describe('verifyChain', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns valid=true with totalEntries=0 for an empty chain', async () => {
    mockQuery.mockReturnValueOnce(mockRows([]));
    const result = await verifyChain('chain-empty');
    expect(result.valid).toBe(true);
    expect(result.totalEntries).toBe(0);
  });

  it('verifies a real chain built with the real hash function', async () => {
    // Use the real hash function to pre-compute legitimate hashes.
    const { computeEntryHash } = await import('@/lib/ecc/exo-chain/hash');

    const t0 = '2026-01-01T00:00:00Z';
    const t1 = '2026-01-01T00:00:01Z';
    const h0 = await computeEntryHash(null, 'budget_check', { ok: true }, t0);
    const h1 = await computeEntryHash(h0, 'enrich_result', { provider: 'p1' }, t1);

    mockQuery.mockReturnValueOnce(mockRows([
      rowFor({ id: 'a', tenantId: 't', chainId: 'c', sequence: 0, prevHashHex: null, entryHashHex: h0, operation: 'budget_check', data: { ok: true }, actor: 'system', createdAt: t0 }),
      rowFor({ id: 'b', tenantId: 't', chainId: 'c', sequence: 1, prevHashHex: h0, entryHashHex: h1, operation: 'enrich_result', data: { provider: 'p1' }, actor: 'system', createdAt: t1 }),
    ]));

    const result = await verifyChain('c');
    expect(result.valid).toBe(true);
    expect(result.totalEntries).toBe(2);
  });

  it('detects tampering and reports brokenAt', async () => {
    const { computeEntryHash } = await import('@/lib/ecc/exo-chain/hash');
    const h0 = await computeEntryHash(null, 'op', { legit: true }, 't0');
    // Original legitimate h1 is computed, but row's data is tampered after-the-fact.
    const h1 = await computeEntryHash(h0, 'op', { legit: true }, 't1');

    mockQuery.mockReturnValueOnce(mockRows([
      rowFor({ id: 'a', tenantId: 't', chainId: 'c', sequence: 0, prevHashHex: null, entryHashHex: h0, operation: 'op', data: { legit: true }, actor: 'system', createdAt: 't0' }),
      rowFor({ id: 'b', tenantId: 't', chainId: 'c', sequence: 1, prevHashHex: h0, entryHashHex: h1, operation: 'op', data: { attacker: true }, actor: 'system', createdAt: 't1' }),
    ]));

    const result = await verifyChain('c');
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
    expect(result.totalEntries).toBe(2);
  });
});
