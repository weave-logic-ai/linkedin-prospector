// Source ingestion orchestrator.
//
// Connectors (Wayback, EDGAR, ...) are pluggable: this module owns the common
// path of rate-limit → robots → fetch → persist. Each connector decides what
// to do with the fetched body (parse filing, reparse LinkedIn snapshot, etc.).
// The service also provides the shared `writeSourceRecord` helper so no
// connector has to re-implement dedup + content hashing.
//
// This file is deliberately small. The real fetch + parse logic lives in
// `connectors/*.ts`.

import crypto from 'crypto';
import { query } from '../db/client';
import { acquire, DEFAULT_BUCKETS, type BucketConfig } from './rate-limiter';
import { isAllowed } from './robots';
import { canonicalizeUrl, hostOf } from './url-normalize';

export interface FetchOptions {
  tenantId: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  /** Skip robots.txt check (only for APIs documented as exempt, e.g. SEC). */
  skipRobots?: boolean;
  /** Custom bucket config — overrides DEFAULT_BUCKETS. */
  bucketConfig?: BucketConfig;
  maxBytes?: number;
  timeoutMs?: number;
}

export class SourceFetchError extends Error {
  constructor(
    message: string,
    public code:
      | 'ROBOTS_DISALLOW'
      | 'HTTP_ERROR'
      | 'TOO_LARGE'
      | 'TIMEOUT'
      | 'INVALID_URL',
    public status?: number
  ) {
    super(message);
    this.name = 'SourceFetchError';
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

/**
 * The core gated fetch. Applies rate limiter, robots.txt check (unless
 * skipped), then performs the HTTP request. Returns the raw body bytes and
 * response metadata.
 */
export async function gatedFetch(
  url: string,
  opts: FetchOptions
): Promise<{ bytes: Buffer; status: number; contentType: string; finalUrl: string }> {
  const host = hostOf(url);
  if (!host) throw new SourceFetchError(`Invalid URL: ${url}`, 'INVALID_URL');

  if (!opts.skipRobots) {
    const robots = await isAllowed(url);
    if (!robots.allowed) {
      throw new SourceFetchError(
        `robots.txt disallows ${url}: ${robots.reason}`,
        'ROBOTS_DISALLOW'
      );
    }
  }

  const bucketCfg =
    opts.bucketConfig ??
    DEFAULT_BUCKETS[host] ??
    ({ capacity: 20, refillPerMin: 20 } as BucketConfig);
  await acquire(host, { tenantId: opts.tenantId, config: bucketCfg });

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );
  try {
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: opts.headers,
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok) {
      throw new SourceFetchError(
        `HTTP ${res.status} ${res.statusText} for ${url}`,
        'HTTP_ERROR',
        res.status
      );
    }
    const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) {
      throw new SourceFetchError(
        `Response ${buf.byteLength} bytes exceeds max ${maxBytes}`,
        'TOO_LARGE'
      );
    }
    return {
      bytes: buf,
      status: res.status,
      contentType: res.headers.get('content-type') ?? 'application/octet-stream',
      finalUrl: res.url,
    };
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new SourceFetchError(`Timeout fetching ${url}`, 'TIMEOUT');
    }
    if (err instanceof SourceFetchError) throw err;
    throw new SourceFetchError(
      `Fetch failed for ${url}: ${(err as Error).message}`,
      'HTTP_ERROR'
    );
  } finally {
    clearTimeout(timer);
  }
}

export interface WriteSourceRecordInput {
  tenantId: string;
  sourceType: string;
  sourceId: string;
  url: string;
  title?: string | null;
  publishedAt?: Date | string | null;
  fetchedAt?: Date;
  body: Buffer;
  contentMime?: string | null;
  metadata?: Record<string, unknown>;
  status?: 'fetched' | 'stored_partial' | 'failed' | 'stale' | 'pending';
}

/**
 * UPSERT a source_records row. Returns the row id and whether it was newly
 * inserted. Dedup is on (tenant_id, source_type, source_id) per the migration
 * unique constraint; on conflict, we update `fetched_at`, `content_hash`,
 * `content`, `status`, `title`, `published_at` — an idempotent re-fetch.
 */
export async function writeSourceRecord(
  input: WriteSourceRecordInput
): Promise<{ id: string; isNew: boolean; bytes: number }> {
  const canonicalUrl = canonicalizeUrl(input.url);
  const contentHash = crypto.createHash('sha256').update(input.body).digest();
  const publishedAt = input.publishedAt
    ? typeof input.publishedAt === 'string'
      ? input.publishedAt
      : input.publishedAt.toISOString()
    : null;

  const res = await query<{ id: string; inserted: boolean }>(
    `INSERT INTO source_records
       (tenant_id, source_type, source_id, canonical_url, title, published_at,
        fetched_at, content_hash, content_bytes, content, content_mime,
        metadata, status)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9, $10, $11::jsonb, $12)
     ON CONFLICT (tenant_id, source_type, source_id) DO UPDATE
       SET fetched_at = NOW(),
           content_hash = EXCLUDED.content_hash,
           content_bytes = EXCLUDED.content_bytes,
           content = EXCLUDED.content,
           content_mime = EXCLUDED.content_mime,
           title = COALESCE(EXCLUDED.title, source_records.title),
           published_at = COALESCE(EXCLUDED.published_at, source_records.published_at),
           metadata = source_records.metadata || EXCLUDED.metadata,
           status = EXCLUDED.status
     RETURNING id, (xmax = 0) AS inserted`,
    [
      input.tenantId,
      input.sourceType,
      input.sourceId,
      canonicalUrl,
      input.title ?? null,
      publishedAt,
      contentHash,
      input.body.byteLength,
      input.body,
      input.contentMime ?? null,
      JSON.stringify(input.metadata ?? {}),
      input.status ?? 'fetched',
    ]
  );
  return {
    id: res.rows[0].id,
    isNew: Boolean(res.rows[0].inserted),
    bytes: input.body.byteLength,
  };
}
