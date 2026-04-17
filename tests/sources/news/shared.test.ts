// Phase 3 Track G — shared news-connector helpers.

import {
  deriveMultiplier,
  googleNewsSiteQuery,
  parseViewCountFromJsonLd,
  metaPublishedAt,
  metaCanonicalUrl,
  loadHtml,
} from '@/lib/sources/connectors/news/shared';

describe('deriveMultiplier (ADR-030 per-item weight)', () => {
  it('returns 1.2 for view counts ≥ 1000', () => {
    expect(deriveMultiplier(1000)).toBe(1.2);
    expect(deriveMultiplier(50_000)).toBe(1.2);
  });
  it('returns 1.0 below threshold or on null', () => {
    expect(deriveMultiplier(999)).toBe(1.0);
    expect(deriveMultiplier(null)).toBe(1.0);
  });
});

describe('googleNewsSiteQuery', () => {
  it('embeds site: + quoted name + quoted domain', () => {
    const url = googleNewsSiteQuery('www.wsj.com', {
      kind: 'person',
      name: 'Jane Doe',
      domain: 'stripe.com',
    });
    const q = decodeURIComponent(url.split('q=')[1]!.split('&')[0]!);
    expect(q).toBe('site:www.wsj.com "Jane Doe" "stripe.com"');
    expect(url).toContain('https://news.google.com/rss/search?q=');
  });
});

describe('parseViewCountFromJsonLd', () => {
  it('finds InteractionCounter ReadAction counts', () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
          {"@type":"NewsArticle","interactionStatistic":[{"@type":"InteractionCounter","interactionType":"https://schema.org/ReadAction","userInteractionCount":12345}]}
        </script>
      </head></html>`;
    const $ = loadHtml(html);
    expect(parseViewCountFromJsonLd($)).toBe(12345);
  });
  it('returns null when no JSON-LD present', () => {
    const $ = loadHtml('<html></html>');
    expect(parseViewCountFromJsonLd($)).toBe(null);
  });
});

describe('metaPublishedAt / metaCanonicalUrl', () => {
  it('parses article:published_time into ISO', () => {
    const $ = loadHtml(`
      <html><head>
        <meta property="article:published_time" content="2026-03-01T00:00:00Z" />
      </head></html>
    `);
    expect(metaPublishedAt($)).toBe(new Date('2026-03-01T00:00:00Z').toISOString());
  });
  it('prefers <link rel="canonical"> over fallback', () => {
    const $ = loadHtml(`
      <html><head>
        <link rel="canonical" href="https://www.example.com/article" />
      </head></html>
    `);
    expect(metaCanonicalUrl($, 'https://fallback.example.com')).toBe(
      'https://www.example.com/article'
    );
  });
  it('falls back when no canonical tag', () => {
    const $ = loadHtml('<html></html>');
    expect(metaCanonicalUrl($, 'https://fallback.example.com')).toBe(
      'https://fallback.example.com'
    );
  });
});
