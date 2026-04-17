// URL canonicalization tests.
//
// Pins the tracking-param strip list + hostname casing + trailing slash +
// hash fragment handling. These invariants are load-bearing for dedup: two
// inputs that differ only in tracking params must produce the same source_id.

import {
  canonicalizeUrl,
  hostOf,
  linkedInPageType,
} from '@/lib/sources/url-normalize';

describe('sources/url-normalize', () => {
  it('lowercases hostname', () => {
    expect(canonicalizeUrl('https://Example.COM/path')).toBe(
      'https://example.com/path'
    );
  });

  it('strips utm_ params', () => {
    const u = canonicalizeUrl(
      'https://example.com/page?utm_source=x&utm_campaign=y&id=42'
    );
    expect(u).toBe('https://example.com/page?id=42');
  });

  it('strips LinkedIn trk param', () => {
    const u = canonicalizeUrl('https://linkedin.com/in/foo?trk=abc&id=1');
    expect(u).toBe('https://linkedin.com/in/foo?id=1');
  });

  it('removes trailing slash from non-root paths', () => {
    expect(canonicalizeUrl('https://example.com/path/')).toBe(
      'https://example.com/path'
    );
  });

  it('drops trailing slash for bare domain', () => {
    expect(canonicalizeUrl('https://example.com/')).toBe('https://example.com');
  });

  it('removes default port', () => {
    expect(canonicalizeUrl('https://example.com:443/path')).toBe(
      'https://example.com/path'
    );
    expect(canonicalizeUrl('http://example.com:80/path')).toBe(
      'http://example.com/path'
    );
  });

  it('strips hash fragments', () => {
    expect(canonicalizeUrl('https://example.com/path#section')).toBe(
      'https://example.com/path'
    );
  });

  it('rejects invalid URLs', () => {
    expect(() => canonicalizeUrl('not a url')).toThrow(/invalid URL/i);
  });

  it('rejects non-http schemes', () => {
    expect(() => canonicalizeUrl('ftp://example.com/file')).toThrow(
      /unsupported scheme/i
    );
  });

  it('hostOf returns lowercase hostname', () => {
    expect(hostOf('https://Example.COM/path')).toBe('example.com');
  });

  it('linkedInPageType identifies profile pages', () => {
    expect(linkedInPageType('https://www.linkedin.com/in/john-doe')).toBe(
      'PROFILE'
    );
  });

  it('linkedInPageType identifies company pages', () => {
    expect(
      linkedInPageType('https://www.linkedin.com/company/anthropic')
    ).toBe('COMPANY');
  });

  it('linkedInPageType returns null for non-LinkedIn', () => {
    expect(linkedInPageType('https://example.com/in/foo')).toBeNull();
  });

  it('linkedInPageType returns null for other LinkedIn sections', () => {
    expect(linkedInPageType('https://linkedin.com/feed')).toBeNull();
  });
});
