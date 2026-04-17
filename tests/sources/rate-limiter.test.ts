// Rate limiter — token bucket semantics.
//
// Tests mock `@/lib/db/client`'s `transaction` helper to feed synthetic bucket
// rows. We verify:
//   1. tryAcquire returns waitMs=0 when tokens are available.
//   2. tryAcquire returns a positive waitMs when tokens are exhausted.
//   3. Refill math: elapsed_ms × refill_per_min / 60000 adds up correctly.

jest.mock('@/lib/db/client', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  healthCheck: jest.fn(),
  getPool: jest.fn(),
  shutdown: jest.fn(),
}));

import { transaction, query } from '@/lib/db/client';
import { tryAcquire, DEFAULT_BUCKETS } from '@/lib/sources/rate-limiter';

const mockTransaction = transaction as jest.MockedFunction<typeof transaction>;
const mockQuery = query as jest.MockedFunction<typeof query>;

function makeClient(rows: Record<string, unknown>[]): {
  query: jest.Mock;
  release: jest.Mock;
} {
  let call = 0;
  return {
    query: jest.fn(async () => {
      const row = rows[Math.min(call++, rows.length - 1)];
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0, fields: [], command: '', oid: 0 };
    }),
    release: jest.fn(),
  };
}

describe('sources/rate-limiter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('DEFAULT_BUCKETS exposes wayback + edgar rates', () => {
    expect(DEFAULT_BUCKETS['web.archive.org']).toEqual({
      capacity: 30,
      refillPerMin: 30,
    });
    expect(DEFAULT_BUCKETS['data.sec.gov']).toEqual({
      capacity: 10,
      refillPerMin: 10,
    });
  });

  it('grants a token when the bucket is full', async () => {
    const now = new Date('2026-04-17T12:00:00Z');
    mockTransaction.mockImplementation(async (fn) => {
      const client = makeClient([
        // ensureBucket returns full bucket
        {
          tokens: 30,
          capacity: 30,
          refill_per_min: 30,
          last_refill_at: now.toISOString(),
        },
        // SELECT FOR UPDATE row
        {
          tokens: 30,
          capacity: 30,
          refill_per_min: 30,
          last_refill_at: now.toISOString(),
        },
        // UPDATE result is ignored
        {},
      ]);
      return fn(client as unknown as Parameters<typeof fn>[0]);
    });

    const out = await tryAcquire('web.archive.org', {
      tenantId: null,
      now,
    });
    expect(out.waitMs).toBe(0);
    expect(out.tokensRemaining).toBe(29);
  });

  it('reports waitMs when the bucket is empty and no refill elapsed', async () => {
    const now = new Date('2026-04-17T12:00:00Z');
    mockTransaction.mockImplementation(async (fn) => {
      const client = makeClient([
        {
          tokens: 0,
          capacity: 30,
          refill_per_min: 30,
          last_refill_at: now.toISOString(),
        },
        {
          tokens: 0,
          capacity: 30,
          refill_per_min: 30,
          last_refill_at: now.toISOString(),
        },
        {},
      ]);
      return fn(client as unknown as Parameters<typeof fn>[0]);
    });
    const out = await tryAcquire('web.archive.org', {
      tenantId: null,
      now,
    });
    expect(out.waitMs).toBeGreaterThan(0);
    // At 30/min we need 2s to refill 1 token.
    expect(out.waitMs).toBe(2000);
  });

  it('refills proportional to elapsed time', async () => {
    const now = new Date('2026-04-17T12:00:00Z');
    const lastRefill = new Date(now.getTime() - 60_000); // 1 min ago
    mockTransaction.mockImplementation(async (fn) => {
      const client = makeClient([
        {
          tokens: 0,
          capacity: 30,
          refill_per_min: 30,
          last_refill_at: lastRefill.toISOString(),
        },
        {
          tokens: 0,
          capacity: 30,
          refill_per_min: 30,
          last_refill_at: lastRefill.toISOString(),
        },
        {},
      ]);
      return fn(client as unknown as Parameters<typeof fn>[0]);
    });
    const out = await tryAcquire('web.archive.org', {
      tenantId: null,
      now,
    });
    // 60s × 30/min / 60s = 30 tokens. After deducting 1, 29 remain.
    expect(out.waitMs).toBe(0);
    expect(out.tokensRemaining).toBeCloseTo(29, 5);
  });

  it('caps refill at bucket capacity', async () => {
    const now = new Date('2026-04-17T12:00:00Z');
    const lastRefill = new Date(now.getTime() - 10 * 60_000); // 10 min ago
    mockTransaction.mockImplementation(async (fn) => {
      const client = makeClient([
        {
          tokens: 0,
          capacity: 30,
          refill_per_min: 30,
          last_refill_at: lastRefill.toISOString(),
        },
        {
          tokens: 0,
          capacity: 30,
          refill_per_min: 30,
          last_refill_at: lastRefill.toISOString(),
        },
        {},
      ]);
      return fn(client as unknown as Parameters<typeof fn>[0]);
    });
    const out = await tryAcquire('web.archive.org', {
      tenantId: null,
      now,
    });
    // 10 min × 30/min = 300 tokens → cap 30 → deduct 1 → 29.
    expect(out.tokensRemaining).toBeCloseTo(29, 5);
  });

  // Keep `mockQuery` import referenced so lint doesn't complain.
  it('exposes the pg client mock', () => {
    expect(mockQuery).toBeDefined();
  });
});
