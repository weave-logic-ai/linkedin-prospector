// Persistent token-bucket rate limiter — `source_rate_limits` table.
//
// Tokens refill at `refill_per_min` tokens/minute, capped at `capacity`. Each
// `acquire` deducts 1 token. If no tokens are available the caller waits the
// computed delay (or throws `RateLimitExhaustedError` if `waitMs === 0`).
//
// Persistence is deliberate: cron runs can outlast any in-process bucket, so we
// store state in Postgres and let Postgres row-level locking serialize acquires
// within a host/tenant pair.
//
// Seed values from `05-source-expansion.md` §11:
//   - web.archive.org: 30 req/min (conservative; public CDX tolerates more).
//   - data.sec.gov:    10 req/min (SEC allows 10/s but we stay deep below).

import type { PoolClient } from 'pg';
import { query, transaction } from '../db/client';

export interface BucketConfig {
  capacity: number;
  refillPerMin: number;
}

export const DEFAULT_BUCKETS: Record<string, BucketConfig> = {
  'web.archive.org': { capacity: 30, refillPerMin: 30 },
  'data.sec.gov': { capacity: 10, refillPerMin: 10 },
  'www.sec.gov': { capacity: 10, refillPerMin: 10 },
};

export class RateLimitExhaustedError extends Error {
  constructor(public host: string, public waitMs: number) {
    super(
      `Rate limit exhausted for host "${host}" — retry after ${waitMs}ms`
    );
    this.name = 'RateLimitExhaustedError';
  }
}

interface Row {
  tokens: number;
  capacity: number;
  refill_per_min: number;
  last_refill_at: string;
}

/**
 * Ensure a bucket row exists for (tenant, host). Inserted with a full token
 * balance so the first call never hits a spurious empty bucket.
 */
async function ensureBucket(
  client: PoolClient,
  tenantId: string | null,
  host: string,
  cfg: BucketConfig
): Promise<Row> {
  // tenantId=null uses the partial unique index uq_source_rate_limits_global;
  // tenantId=<uuid> uses the standard unique (tenant_id, host).
  if (tenantId === null) {
    const res = await client.query<Row>(
      `INSERT INTO source_rate_limits (tenant_id, host, capacity, refill_per_min, tokens, last_refill_at)
       VALUES (NULL, $1, $2, $3, $2, NOW())
       ON CONFLICT (host) WHERE tenant_id IS NULL DO UPDATE
         SET capacity = EXCLUDED.capacity, refill_per_min = EXCLUDED.refill_per_min
       RETURNING tokens, capacity, refill_per_min, last_refill_at`,
      [host, cfg.capacity, cfg.refillPerMin]
    );
    return res.rows[0];
  }
  const res = await client.query<Row>(
    `INSERT INTO source_rate_limits (tenant_id, host, capacity, refill_per_min, tokens, last_refill_at)
     VALUES ($1, $2, $3, $4, $3, NOW())
     ON CONFLICT (tenant_id, host) DO UPDATE
       SET capacity = EXCLUDED.capacity, refill_per_min = EXCLUDED.refill_per_min
     RETURNING tokens, capacity, refill_per_min, last_refill_at`,
    [tenantId, host, cfg.capacity, cfg.refillPerMin]
  );
  return res.rows[0];
}

/**
 * Attempt to take 1 token. Returns 0 on success, or a recommended wait time in
 * ms if the bucket is empty. The caller can sleep and retry or escalate.
 */
export async function tryAcquire(
  host: string,
  opts: { tenantId?: string | null; config?: BucketConfig; now?: Date } = {}
): Promise<{ waitMs: number; tokensRemaining: number }> {
  const tenantId = opts.tenantId ?? null;
  const cfg =
    opts.config ??
    DEFAULT_BUCKETS[host] ??
    ({ capacity: 20, refillPerMin: 20 } as BucketConfig);
  const now = opts.now ?? new Date();

  return transaction(async (client) => {
    // Lock the row for update so concurrent acquires serialize. ensureBucket
    // does an UPSERT first so the SELECT FOR UPDATE always hits a row.
    await ensureBucket(client, tenantId, host, cfg);
    const selectSql =
      tenantId === null
        ? `SELECT tokens, capacity, refill_per_min, last_refill_at
             FROM source_rate_limits WHERE tenant_id IS NULL AND host = $1
             FOR UPDATE`
        : `SELECT tokens, capacity, refill_per_min, last_refill_at
             FROM source_rate_limits WHERE tenant_id = $1 AND host = $2
             FOR UPDATE`;
    const selectParams = tenantId === null ? [host] : [tenantId, host];
    const res = await client.query<Row>(selectSql, selectParams);
    const row = res.rows[0];

    // Compute elapsed minutes and refill tokens.
    const lastRefill = new Date(row.last_refill_at);
    const elapsedMs = now.getTime() - lastRefill.getTime();
    const refilled = (elapsedMs / 60000) * row.refill_per_min;
    const tokens = Math.min(row.capacity, row.tokens + refilled);

    if (tokens >= 1) {
      const remaining = tokens - 1;
      const updateSql =
        tenantId === null
          ? `UPDATE source_rate_limits
             SET tokens = $1, last_refill_at = $2, last_acquire_at = $2
             WHERE tenant_id IS NULL AND host = $3`
          : `UPDATE source_rate_limits
             SET tokens = $1, last_refill_at = $2, last_acquire_at = $2
             WHERE tenant_id = $3 AND host = $4`;
      const updateParams =
        tenantId === null
          ? [remaining, now.toISOString(), host]
          : [remaining, now.toISOString(), tenantId, host];
      await client.query(updateSql, updateParams);
      return { waitMs: 0, tokensRemaining: remaining };
    }

    // Not enough tokens. Compute how long until we have 1 token refilled.
    const deficit = 1 - tokens;
    const waitMs = Math.ceil((deficit / row.refill_per_min) * 60000);
    return { waitMs, tokensRemaining: tokens };
  });
}

/**
 * Block until a token is acquired. Respects `maxWaitMs` — if the required
 * wait is longer, throws RateLimitExhaustedError and the caller can decide to
 * surface a job-deferred state.
 */
export async function acquire(
  host: string,
  opts: {
    tenantId?: string | null;
    config?: BucketConfig;
    maxWaitMs?: number;
  } = {}
): Promise<void> {
  const maxWaitMs = opts.maxWaitMs ?? 30_000;
  const deadline = Date.now() + maxWaitMs;
  for (;;) {
    const { waitMs } = await tryAcquire(host, opts);
    if (waitMs === 0) return;
    const remaining = deadline - Date.now();
    if (waitMs > remaining) {
      throw new RateLimitExhaustedError(host, waitMs);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
  }
}

/** Read-only inspection — useful for admin UI + tests. */
export async function inspectBucket(
  host: string,
  tenantId: string | null = null
): Promise<Row | null> {
  const sql =
    tenantId === null
      ? `SELECT tokens, capacity, refill_per_min, last_refill_at
         FROM source_rate_limits WHERE tenant_id IS NULL AND host = $1`
      : `SELECT tokens, capacity, refill_per_min, last_refill_at
         FROM source_rate_limits WHERE tenant_id = $1 AND host = $2`;
  const params = tenantId === null ? [host] : [tenantId, host];
  const res = await query<Row>(sql, params);
  return res.rows[0] ?? null;
}
