// URL canonicalization for source dedup.
//
// Per `05-source-expansion.md` §12: same URL with different tracking params
// must dedup into one source_record. Canonicalization rules:
//   1. Lowercase host.
//   2. Strip `utm_*`, `fbclid`, `gclid`, `mc_eid`, `ref`, `ref_src` params.
//   3. Remove trailing slash on path (but keep a single `/` if path is empty).
//   4. Remove default ports (80 for http, 443 for https).
//   5. Strip hash fragments — they are client-side and rarely affect server
//      content; LinkedIn in particular uses `#`-anchors that we don't want to
//      treat as distinct records.
//   6. Lowercase the scheme. Reject non-http(s) schemes as invalid.
//
// We do NOT sort query params — the remaining (non-tracking) params are often
// positional and sorting could change meaning for API-style URLs. Stable order
// is the caller's responsibility.

const TRACKING_PARAM_PATTERNS: RegExp[] = [
  /^utm_/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^mc_eid$/i,
  /^mc_cid$/i,
  /^ref$/i,
  /^ref_src$/i,
  /^ref_url$/i,
  /^igshid$/i,
  /^_ga$/i,
  /^s_cid$/i,
  /^trk$/i,          // LinkedIn tracking param
  /^trkCampaign$/i,
  /^originalSubdomain$/i,
];

function isTrackingParam(key: string): boolean {
  return TRACKING_PARAM_PATTERNS.some((p) => p.test(key));
}

/**
 * Canonicalize a URL per the rules above. Throws `Error` with a descriptive
 * message on invalid input; callers should catch and reject at the boundary.
 */
export function canonicalizeUrl(input: string): string {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new Error('canonicalizeUrl: input must be a non-empty string');
  }
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error(`canonicalizeUrl: invalid URL "${input}"`);
  }

  const scheme = url.protocol.toLowerCase();
  if (scheme !== 'http:' && scheme !== 'https:') {
    throw new Error(`canonicalizeUrl: unsupported scheme "${url.protocol}"`);
  }
  url.protocol = scheme;

  url.hostname = url.hostname.toLowerCase();

  // Remove default ports.
  if (
    (scheme === 'http:' && url.port === '80') ||
    (scheme === 'https:' && url.port === '443')
  ) {
    url.port = '';
  }

  // Strip tracking params.
  const toDelete: string[] = [];
  url.searchParams.forEach((_value, key) => {
    if (isTrackingParam(key)) toDelete.push(key);
  });
  for (const key of toDelete) url.searchParams.delete(key);

  // Remove hash.
  url.hash = '';

  // Trim trailing slash on path (keep single root `/`).
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }

  // URL serialization produces the canonical form.
  let out = url.toString();

  // URL.toString() re-adds the trailing `/` for empty pathname. If there is no
  // query/hash and path is `/`, drop it to match the "bare domain" form.
  if (out.endsWith('/') && url.search === '' && url.pathname === '/') {
    out = out.slice(0, -1);
  }
  return out;
}

/** Lower-cased hostname. Used by the rate-limiter + robots lookup. */
export function hostOf(input: string): string {
  try {
    return new URL(input).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Classify a canonical URL as a LinkedIn profile / company page. Returns the
 * matching pageType constant (uppercase, per the extension's enum), or null.
 */
export function linkedInPageType(canonicalUrl: string): 'PROFILE' | 'COMPANY' | null {
  try {
    const url = new URL(canonicalUrl);
    if (!/(^|\.)linkedin\.com$/.test(url.hostname)) return null;
    if (/^\/in\/[^/]+$/.test(url.pathname)) return 'PROFILE';
    if (/^\/company\/[^/]+$/.test(url.pathname)) return 'COMPANY';
    return null;
  } catch {
    return null;
  }
}
