// Research Tools Sprint — WS-4 Phase 4 Track H: lens-url encoding tests.
//
// Exercises the reversible `opaque:<base64>` encoding used by shareable deep
// links. Round-trip stability, version gating, opaque-config decode failure,
// and the URL builder shape are all covered here.

import {
  encodeLensToUrl,
  decodeOpaqueLensUrl,
  buildLensShareUrls,
  LENS_URL_VERSION,
  OPAQUE_PREFIX,
} from '@/lib/targets/lens-url';

describe('targets/lens-url', () => {
  it('encodeLensToUrl / decodeOpaqueLensUrl round-trips a simple config', () => {
    const config = {
      icpProfileIds: ['icp-1', 'icp-2'],
      filters: { niche: 'ai-researchers' },
    };
    const encoded = encodeLensToUrl({ config, name: 'Acme deep dive' });
    expect(encoded.startsWith(OPAQUE_PREFIX)).toBe(true);
    const decoded = decodeOpaqueLensUrl(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded?.v).toBe(LENS_URL_VERSION);
    expect(decoded?.name).toBe('Acme deep dive');
    expect(decoded?.config).toEqual(config);
  });

  it('encodeLensToUrl produces URL-safe base64 (no +, /, =)', () => {
    // JSON shape chosen to force base64 padding + special chars without
    // versioning the encoding.
    const encoded = encodeLensToUrl({
      config: { longKey: 'x'.repeat(64), arr: [1, 2, 3] },
    });
    const blob = encoded.slice(OPAQUE_PREFIX.length);
    expect(blob).not.toMatch(/[+/=]/);
  });

  it('decodeOpaqueLensUrl returns null for a missing or non-opaque param', () => {
    expect(decodeOpaqueLensUrl(null)).toBeNull();
    expect(decodeOpaqueLensUrl(undefined)).toBeNull();
    expect(decodeOpaqueLensUrl('')).toBeNull();
    expect(decodeOpaqueLensUrl('some-lens-id')).toBeNull();
    expect(decodeOpaqueLensUrl('opaque:')).toBeNull();
  });

  it('decodeOpaqueLensUrl returns null for malformed base64 / JSON / version mismatch', () => {
    // Not valid base64 JSON (Buffer decodes permissively so supply valid
    // base64 that decodes to non-JSON text).
    const notJson = `${OPAQUE_PREFIX}bm90LWpzb24`; // base64('not-json')
    expect(decodeOpaqueLensUrl(notJson)).toBeNull();

    // Valid JSON but missing v.
    const missingV = `${OPAQUE_PREFIX}${Buffer.from(
      JSON.stringify({ config: {} }),
      'utf-8'
    )
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')}`;
    expect(decodeOpaqueLensUrl(missingV)).toBeNull();

    // Future version — rejected so we don't mis-apply a new schema.
    const future = `${OPAQUE_PREFIX}${Buffer.from(
      JSON.stringify({ v: 999, config: {} }),
      'utf-8'
    )
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')}`;
    expect(decodeOpaqueLensUrl(future)).toBeNull();
  });

  it('decodeOpaqueLensUrl returns null when config is not an object', () => {
    const badConfig = `${OPAQUE_PREFIX}${Buffer.from(
      JSON.stringify({ v: LENS_URL_VERSION, config: 'not-an-object' }),
      'utf-8'
    )
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')}`;
    expect(decodeOpaqueLensUrl(badConfig)).toBeNull();
  });

  it('decodeOpaqueLensUrl preserves Unicode content through the round-trip', () => {
    const config = { label: 'やぁ — Über • 🚀', tags: ['café'] };
    const decoded = decodeOpaqueLensUrl(encodeLensToUrl({ config }));
    expect(decoded?.config).toEqual(config);
  });

  it('buildLensShareUrls yields both tenantLocal and opaque URLs', () => {
    const urls = buildLensShareUrls({
      origin: 'https://example.test',
      pathname: '/targets/abc',
      lensId: 'lens-xyz',
      config: { icpProfileIds: ['icp-1'] },
      lensName: 'Shared',
    });
    expect(urls.tenantLocal).toBe('https://example.test/targets/abc?lens=lens-xyz');
    expect(urls.opaque.startsWith('https://example.test/targets/abc?lens=')).toBe(true);
    // The opaque segment must be URL-escaped — colon in `opaque:` becomes %3A.
    expect(urls.opaque).toContain('opaque%3A');
  });
});
