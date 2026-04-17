// Research Tools Sprint — WS-4 Phase 4 Track H: lens deep-link encoding.
//
// This module provides REVERSIBLE encodings for shareable lens URLs. It is
// **not cryptographically signed** — an opaque URL blob is self-describing,
// anyone can tamper with it, and any code path that applies the decoded
// config must treat it as untrusted input.
//
// Why not signed?
//   - The primary use case is a colleague-to-colleague share ("here's the
//     lens I'm using for this research"), not an auth-bearing capability.
//   - Signing would require a per-tenant secret that the recipient's tenant
//     would not know how to verify anyway.
//   - The consuming code path (deep-link hydrator) applies the config
//     **transiently** (no DB write, no activation) — the worst an attacker
//     can do with a tampered blob is show themselves a different view.
//
// Versioning
//   - The encoded object always carries `v: 1`. Future schema changes bump
//     this; the decoder rejects unknown versions so an older build does not
//     silently mis-apply a newer lens shape.
//   - The wire format is a URL-safe base64 of the JSON-stringified payload.
//   - Round-trip stability is tested in `tests/targets/lens-url.test.ts`.

export const LENS_URL_VERSION = 1 as const;

/** Shape persisted inside `?lens=opaque:<base64>`. */
export interface EncodedLensPayload {
  v: typeof LENS_URL_VERSION;
  /** Lens display name, surfaced in the "viewing through lens: X" banner. */
  name?: string;
  /** The lens's config JSONB — ICP ids, filters, etc. */
  config: Record<string, unknown>;
}

/** Prefix written before the base64 blob to distinguish from a tenant-local id. */
export const OPAQUE_PREFIX = 'opaque:';

/** URL-safe base64 (no +, no /, no =) of a UTF-8 string. */
function toUrlSafeBase64(input: string): string {
  // Prefer Buffer in Node / Next.js runtimes; fall back to btoa in the edge
  // runtime + browser. `btoa` only handles latin-1 so we UTF-8 encode first.
  const b64 =
    typeof Buffer !== 'undefined'
      ? Buffer.from(input, 'utf-8').toString('base64')
      : btoa(unescape(encodeURIComponent(input)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromUrlSafeBase64(input: string): string {
  const padLen = (4 - (input.length % 4)) % 4;
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLen);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(padded, 'base64').toString('utf-8');
  }
  return decodeURIComponent(escape(atob(padded)));
}

/**
 * Serialize a lens config into the `opaque:<base64>` form used in deep-link
 * URLs. Returned string is safe to drop into a `?lens=` query parameter
 * without further URL escaping.
 */
export function encodeLensToUrl(input: {
  config: Record<string, unknown>;
  name?: string;
}): string {
  const payload: EncodedLensPayload = {
    v: LENS_URL_VERSION,
    name: input.name,
    config: input.config,
  };
  const json = JSON.stringify(payload);
  return `${OPAQUE_PREFIX}${toUrlSafeBase64(json)}`;
}

/**
 * Decode an `?lens=` parameter. Returns the opaque payload if the param
 * begins with `opaque:` and decodes cleanly; returns `null` otherwise — the
 * caller then treats the param as a tenant-local lens id.
 *
 * Never throws: malformed base64, non-JSON payloads, missing `v`, or
 * mismatched versions all return `null`. This is deliberate — the decoder
 * is called on every page load and we'd rather render the default view than
 * crash on a tampered link.
 */
export function decodeOpaqueLensUrl(param: string | null | undefined): EncodedLensPayload | null {
  if (!param || typeof param !== 'string') return null;
  if (!param.startsWith(OPAQUE_PREFIX)) return null;
  const b64 = param.slice(OPAQUE_PREFIX.length);
  if (b64.length === 0) return null;
  try {
    const json = fromUrlSafeBase64(b64);
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const candidate = parsed as Partial<EncodedLensPayload>;
    if (candidate.v !== LENS_URL_VERSION) return null;
    if (!candidate.config || typeof candidate.config !== 'object') return null;
    return {
      v: LENS_URL_VERSION,
      name: typeof candidate.name === 'string' ? candidate.name : undefined,
      config: candidate.config as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

/**
 * Helper used by `lens-manager.tsx` to render the two share forms. Returns
 * absolute URLs (query-string only when `origin` is empty, useful in tests).
 */
export function buildLensShareUrls(input: {
  origin: string;
  pathname: string;
  lensId: string;
  config: Record<string, unknown>;
  lensName?: string;
}): { tenantLocal: string; opaque: string } {
  const base = `${input.origin}${input.pathname}`;
  const opaqueParam = encodeLensToUrl({ config: input.config, name: input.lensName });
  return {
    tenantLocal: `${base}?lens=${input.lensId}`,
    opaque: `${base}?lens=${encodeURIComponent(opaqueParam)}`,
  };
}
