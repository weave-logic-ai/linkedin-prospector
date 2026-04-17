// Snippet blob storage — Phase 1.5 image snippet round-trip.
//
// Wraps the `snippet_blobs` table (migration 034). The public surface is:
//   * upsertBlob(): compute sha256, UPSERT on (tenant_id, sha256), return id
//   * getBlob():    tenant-scoped fetch by blob id (RLS equivalent at the
//                    query level — the WHERE clause pins tenant_id so cross-
//                    tenant lookups return null).
//
// The dedup behaviour is intentional per `03-snippet-editor.md` §3.1: the
// same logo uploaded twice is one row, referenced by every snippet that
// includes it. We never delete a blob when a snippet is deleted; retention
// cleanup runs as a sweep (out of scope for Phase 1.5).

import { createHash } from 'crypto';
import { query } from '../db/client';

export interface BlobRecord {
  id: string;
  tenantId: string;
  mimeType: string;
  byteLength: number;
  sha256Hex: string;
  bytes: Buffer;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export interface UpsertBlobInput {
  tenantId: string;
  mimeType: string;
  bytes: Buffer;
  width?: number | null;
  height?: number | null;
}

export interface UpsertBlobResult {
  id: string;
  sha256Hex: string;
  byteLength: number;
  reused: boolean;
}

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB per Phase 1.5 spec.
export const ALLOWED_IMAGE_MIME_TYPES = new Set<string>([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

/**
 * Compute the hex-encoded SHA-256 of the given bytes. Pure helper; separated
 * so tests can exercise the hash contract without a DB.
 */
export function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Validate image payload shape. Returns the decoded Buffer on success.
 * Throws an Error with a user-facing message on failure so the route can
 * surface a 400 with a clear reason.
 */
export function decodeAndValidateImage(
  base64: string,
  mimeType: string
): Buffer {
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error(
      `unsupported mimeType "${mimeType}"; expected one of ${Array.from(
        ALLOWED_IMAGE_MIME_TYPES
      ).join(', ')}`
    );
  }
  if (typeof base64 !== 'string' || base64.length === 0) {
    throw new Error('imageBytes must be a non-empty base64 string');
  }
  // Strip optional `data:<mime>;base64,` prefix — the extension may send
  // either form. Accept both, normalize to pure base64 here.
  const cleaned = base64.replace(/^data:[^,]+,/, '');
  let bytes: Buffer;
  try {
    bytes = Buffer.from(cleaned, 'base64');
  } catch {
    throw new Error('imageBytes is not valid base64');
  }
  if (bytes.byteLength === 0) {
    throw new Error('imageBytes decoded to zero bytes');
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(
      `image exceeds 5 MB limit (got ${bytes.byteLength} bytes)`
    );
  }
  return bytes;
}

/**
 * UPSERT a blob row. Dedups on (tenant_id, sha256) — if an identical blob is
 * already stored for this tenant, its existing id is returned and no new row
 * is created.
 *
 * Returns `reused=true` when the hash already existed, else `reused=false`.
 */
export async function upsertBlob(
  input: UpsertBlobInput
): Promise<UpsertBlobResult> {
  const { tenantId, mimeType, bytes, width = null, height = null } = input;

  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error(`upsertBlob: unsupported mimeType "${mimeType}"`);
  }
  if (bytes.byteLength === 0) {
    throw new Error('upsertBlob: bytes must be non-empty');
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(
      `upsertBlob: exceeds ${MAX_IMAGE_BYTES}-byte cap (got ${bytes.byteLength})`
    );
  }

  const hashHex = sha256Hex(bytes);
  const hashBuf = Buffer.from(hashHex, 'hex');

  // First try the happy path: look up an existing row. This avoids a write
  // in the common "same logo captured twice" case and cleanly returns the
  // existing id without consuming a fresh UUID.
  const existing = await query<{ id: string; byte_length: number }>(
    `SELECT id, byte_length FROM snippet_blobs
     WHERE tenant_id = $1 AND sha256 = $2
     LIMIT 1`,
    [tenantId, hashBuf]
  );
  if (existing.rows[0]) {
    return {
      id: existing.rows[0].id,
      sha256Hex: hashHex,
      byteLength: Number(existing.rows[0].byte_length),
      reused: true,
    };
  }

  // Race-safe insert: another request could create the row between our
  // SELECT and our INSERT. Use ON CONFLICT to fall back to the existing id.
  const inserted = await query<{ id: string }>(
    `INSERT INTO snippet_blobs (tenant_id, mime_type, byte_length, sha256, data)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT ON CONSTRAINT uq_snippet_blobs_sha
     DO UPDATE SET mime_type = snippet_blobs.mime_type
     RETURNING id`,
    [tenantId, mimeType, bytes.byteLength, hashBuf, bytes]
  );

  // Width/height live in causal_nodes.output per 03-snippet-editor.md §3 —
  // the schema does not have width/height columns on snippet_blobs in
  // migration 034. Silently drop these; callers who need them should persist
  // them in the node payload. (Documenting the intent via the void cast so
  // future readers see why the parameters exist.)
  void width;
  void height;

  return {
    id: inserted.rows[0].id,
    sha256Hex: hashHex,
    byteLength: bytes.byteLength,
    reused: false,
  };
}

/**
 * Fetch a blob by id, scoped to the given tenant. Returns null when the
 * blob does not exist OR belongs to another tenant — the WHERE clause on
 * `tenant_id` enforces tenant isolation at the query level, matching the
 * row-level-security posture of the text-snippet path.
 */
export async function getBlob(
  tenantId: string,
  blobId: string
): Promise<BlobRecord | null> {
  const res = await query<{
    id: string;
    tenant_id: string;
    mime_type: string;
    byte_length: number;
    sha256: Buffer;
    data: Buffer;
    created_at: string;
  }>(
    `SELECT id, tenant_id, mime_type, byte_length, sha256, data, created_at
     FROM snippet_blobs
     WHERE id = $1 AND tenant_id = $2
     LIMIT 1`,
    [blobId, tenantId]
  );
  if (!res.rows[0]) return null;
  const row = res.rows[0];
  return {
    id: row.id,
    tenantId: row.tenant_id,
    mimeType: row.mime_type,
    byteLength: Number(row.byte_length),
    sha256Hex: Buffer.from(row.sha256).toString('hex'),
    bytes: Buffer.from(row.data),
    width: null,
    height: null,
    createdAt: row.created_at,
  };
}
