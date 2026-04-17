// Corporate blog discovery — pure-function tests for the sitemap parser, the
// discovery fallback chain ordering, and the domain normalization helper.

import {
  normalizeDomain,
  parseSitemap,
  DEFAULT_CANDIDATE_PATHS,
  isBlogConnectorEnabled,
} from '@/lib/sources/connectors/corporate-blog';

describe('normalizeDomain', () => {
  it('adds https:// to a bare hostname', () => {
    expect(normalizeDomain('example.com')).toBe('https://example.com');
  });

  it('strips paths', () => {
    expect(normalizeDomain('https://example.com/about')).toBe(
      'https://example.com'
    );
  });

  it('forces host lowercase', () => {
    expect(normalizeDomain('HTTPS://EXAMPLE.COM')).toBe(
      'https://example.com'
    );
  });

  it('throws on empty input', () => {
    expect(() => normalizeDomain('')).toThrow();
  });
});

describe('DEFAULT_CANDIDATE_PATHS', () => {
  it('starts with /feed (the most common corporate RSS convention)', () => {
    expect(DEFAULT_CANDIDATE_PATHS[0]).toBe('/feed');
  });

  it('includes both /rss and /rss.xml to cover variant hosts', () => {
    expect(DEFAULT_CANDIDATE_PATHS).toContain('/rss');
    expect(DEFAULT_CANDIDATE_PATHS).toContain('/rss.xml');
  });

  it('checks /blog/feed before falling through to /atom.xml', () => {
    const blog = DEFAULT_CANDIDATE_PATHS.indexOf('/blog/feed');
    const atom = DEFAULT_CANDIDATE_PATHS.indexOf('/atom.xml');
    expect(blog).toBeGreaterThanOrEqual(0);
    expect(atom).toBeGreaterThanOrEqual(0);
    expect(blog).toBeLessThan(atom);
  });
});

describe('parseSitemap', () => {
  it('extracts URL + lastmod pairs from a standard sitemap', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url>
          <loc>https://example.com/blog/post-one</loc>
          <lastmod>2024-03-01</lastmod>
        </url>
        <url>
          <loc>https://example.com/news/announcement</loc>
          <lastmod>2024-03-15T09:00:00Z</lastmod>
        </url>
      </urlset>`;
    const entries = parseSitemap(xml);
    expect(entries).toHaveLength(2);
    expect(entries[0].loc).toBe('https://example.com/blog/post-one');
    expect(entries[0].lastmod?.toISOString()).toBe('2024-03-01T00:00:00.000Z');
    expect(entries[1].loc).toBe('https://example.com/news/announcement');
  });

  it('returns [] on a non-sitemap document', () => {
    expect(parseSitemap('<root><nope/></root>')).toEqual([]);
  });

  it('handles entries without lastmod', () => {
    const xml = `<urlset>
      <url><loc>https://example.com/press/one</loc></url>
    </urlset>`;
    const entries = parseSitemap(xml);
    expect(entries).toHaveLength(1);
    expect(entries[0].lastmod).toBeNull();
  });

  it('ignores malformed lastmod values', () => {
    const xml = `<urlset>
      <url>
        <loc>https://example.com/blog/ok</loc>
        <lastmod>not-a-date</lastmod>
      </url>
    </urlset>`;
    const entries = parseSitemap(xml);
    expect(entries[0].lastmod).toBeNull();
  });
});

describe('isBlogConnectorEnabled', () => {
  const PREV = process.env.RESEARCH_CONNECTOR_BLOG;
  afterEach(() => {
    process.env.RESEARCH_CONNECTOR_BLOG = PREV;
  });

  it('defaults to false when the flag is missing', () => {
    delete process.env.RESEARCH_CONNECTOR_BLOG;
    expect(isBlogConnectorEnabled()).toBe(false);
  });

  it('is true only for exact string "true"', () => {
    process.env.RESEARCH_CONNECTOR_BLOG = 'true';
    expect(isBlogConnectorEnabled()).toBe(true);
    process.env.RESEARCH_CONNECTOR_BLOG = 'yes';
    expect(isBlogConnectorEnabled()).toBe(false);
  });
});
