// ExoChain hash tests: algorithm-agnostic
// NOTE: A parallel agent may swap the underlying algorithm (SHA-256 → BLAKE3).
// These tests verify PROPERTIES (determinism, uniqueness, linkage), not specific bytes.

import { computeEntryHash, verifyChainHashes } from '@/lib/ecc/exo-chain/hash';

describe('computeEntryHash', () => {
  it('is deterministic: same inputs → same output', async () => {
    const h1 = await computeEntryHash(null, 'budget_check', { foo: 1 }, '2026-01-01T00:00:00Z');
    const h2 = await computeEntryHash(null, 'budget_check', { foo: 1 }, '2026-01-01T00:00:00Z');
    expect(h1).toBe(h2);
  });

  it('produces hex-encoded output of consistent length', async () => {
    const h1 = await computeEntryHash(null, 'budget_check', {}, '2026-01-01T00:00:00Z');
    const h2 = await computeEntryHash('abc123', 'enrich_result', { x: 'y' }, '2026-02-02T00:00:00Z');
    // Hex only
    expect(h1).toMatch(/^[0-9a-f]+$/);
    expect(h2).toMatch(/^[0-9a-f]+$/);
    // Lengths must match (consistent algorithm)
    expect(h1.length).toBe(h2.length);
    // Non-empty, at least 32 hex chars (128-bit minimum)
    expect(h1.length).toBeGreaterThanOrEqual(32);
  });

  it('different data → different hash', async () => {
    const h1 = await computeEntryHash(null, 'op', { a: 1 }, '2026-01-01');
    const h2 = await computeEntryHash(null, 'op', { a: 2 }, '2026-01-01');
    expect(h1).not.toBe(h2);
  });

  it('different operation → different hash', async () => {
    const h1 = await computeEntryHash(null, 'op1', { a: 1 }, '2026-01-01');
    const h2 = await computeEntryHash(null, 'op2', { a: 1 }, '2026-01-01');
    expect(h1).not.toBe(h2);
  });

  it('different prevHash → different hash (chain linkage)', async () => {
    const h1 = await computeEntryHash(null, 'op', { a: 1 }, '2026-01-01');
    const h2 = await computeEntryHash('ff'.repeat(16), 'op', { a: 1 }, '2026-01-01');
    expect(h1).not.toBe(h2);
  });

  it('different timestamp → different hash', async () => {
    const h1 = await computeEntryHash(null, 'op', { a: 1 }, '2026-01-01');
    const h2 = await computeEntryHash(null, 'op', { a: 1 }, '2026-02-01');
    expect(h1).not.toBe(h2);
  });
});

describe('verifyChainHashes', () => {
  async function buildEntry(
    prevHash: string | null,
    operation: string,
    data: Record<string, unknown>,
    createdAt: string
  ) {
    const entryHash = await computeEntryHash(prevHash, operation, data, createdAt);
    return { prevHash, entryHash, operation, data, createdAt };
  }

  it('returns valid=true for an empty chain', async () => {
    const result = await verifyChainHashes([]);
    expect(result.valid).toBe(true);
  });

  it('returns valid=true for a well-formed chain', async () => {
    const e0 = await buildEntry(null, 'budget_check', { ok: true }, '2026-01-01T00:00:00Z');
    const e1 = await buildEntry(e0.entryHash, 'enrich_result', { provider: 'x' }, '2026-01-01T00:00:01Z');
    const e2 = await buildEntry(e1.entryHash, 'waterfall_complete', { total: 1 }, '2026-01-01T00:00:02Z');

    const result = await verifyChainHashes([e0, e1, e2]);
    expect(result.valid).toBe(true);
    expect(result.brokenAt).toBeUndefined();
  });

  it('detects tamper on entry data (hash mismatch)', async () => {
    const e0 = await buildEntry(null, 'budget_check', { ok: true }, '2026-01-01T00:00:00Z');
    const e1 = await buildEntry(e0.entryHash, 'enrich_result', { provider: 'x' }, '2026-01-01T00:00:01Z');

    // Tamper: modify data but keep stored hash
    const tampered = { ...e1, data: { provider: 'attacker' } };

    const result = await verifyChainHashes([e0, tampered]);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
  });

  it('detects broken prev_hash linkage', async () => {
    const e0 = await buildEntry(null, 'budget_check', { ok: true }, '2026-01-01T00:00:00Z');
    const e1 = await buildEntry(e0.entryHash, 'enrich_result', {}, '2026-01-01T00:00:01Z');
    const badLinkage = { ...e1, prevHash: 'deadbeef'.repeat(8) };

    const result = await verifyChainHashes([e0, badLinkage]);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
  });

  it('detects non-null prev_hash on the first entry', async () => {
    const e0 = await buildEntry('a'.repeat(64), 'op', {}, '2026-01-01');
    // The stored hash WAS computed with that prev, but first entry cannot have a prev.
    const result = await verifyChainHashes([e0]);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(0);
  });
});
