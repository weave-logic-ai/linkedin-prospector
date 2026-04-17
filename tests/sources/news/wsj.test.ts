// Phase 3 Track G — WSJ connector unit tests.
//
// Covers:
//   1. URL formation — `buildWsjSearchUrl` encodes the entity correctly into
//      a Google News `site:wsj.com` query.
//   2. Body parse — `parseWsjArticle` extracts title/author/publishedAt/body
//      from a representative fixture HTML snippet.
//   3. Paywall detection — the paywall heuristic fires on registration-wall
//      HTML and skips free articles.

import {
  buildWsjSearchUrl,
  parseWsjSearchLinks,
  parseWsjArticle,
  detectWsjPaywall,
  WSJ_HOST,
  WSJ_ADAPTER,
} from '@/lib/sources/connectors/news/wsj';
import { loadHtml } from '@/lib/sources/connectors/news/shared';

describe('WSJ connector — URL formation', () => {
  it('builds a Google News site: query for a person entity', () => {
    const url = buildWsjSearchUrl({
      kind: 'person',
      name: 'Jane Doe',
      domain: 'stripe.com',
    });
    expect(url.startsWith('https://news.google.com/rss/search?q=')).toBe(true);
    // URL-decoded query should contain site: and the person name.
    const q = decodeURIComponent(url.split('q=')[1]!.split('&')[0]!);
    expect(q).toContain('site:www.wsj.com');
    expect(q).toContain('"Jane Doe"');
    expect(q).toContain('"stripe.com"');
  });

  it('encodes " in names safely', () => {
    const url = buildWsjSearchUrl({ kind: 'person', name: 'O"Malley', domain: undefined });
    expect(url).not.toContain('"');
    // The inner quotes around the name are URL-escaped.
    expect(url).toContain('%22');
  });

  it('adapter exposes WSJ host + cap', () => {
    expect(WSJ_ADAPTER.host).toBe(WSJ_HOST);
    expect(WSJ_ADAPTER.articleCap).toBe(5);
    expect(WSJ_ADAPTER.defaultMaxArticles).toBe(5);
  });
});

describe('WSJ connector — search link parsing', () => {
  it('pulls item links from a Google News RSS fixture', () => {
    const xml = `<?xml version="1.0"?><rss><channel>
      <item>
        <title>Stripe names Jane Doe CFO</title>
        <link>https://news.google.com/rss/articles/abc123</link>
        <guid>https://www.wsj.com/business/stripe-jane-doe</guid>
      </item>
      <item>
        <title>Unrelated</title>
        <link>https://news.google.com/rss/articles/xyz</link>
        <guid>https://www.example.com/article</guid>
      </item>
    </channel></rss>`;
    const $ = loadHtml(xml, { xmlMode: true });
    const hits = parseWsjSearchLinks($);
    expect(hits.length).toBe(2);
    // When guid is a WSJ URL we prefer it.
    expect(hits[0].url).toBe('https://www.wsj.com/business/stripe-jane-doe');
    expect(hits[0].title).toBe('Stripe names Jane Doe CFO');
  });
});

describe('WSJ connector — article body parse', () => {
  const ARTICLE_HTML = `
    <html>
      <head>
        <meta property="og:title" content="Stripe names Jane Doe CFO" />
        <meta property="article:published_time" content="2026-01-15T10:00:00Z" />
        <meta name="author" content="Reporter McReport" />
        <link rel="canonical" href="https://www.wsj.com/business/stripe-jane-doe" />
      </head>
      <body>
        <h1 itemprop="headline">Stripe names Jane Doe CFO</h1>
        <section subscriber-content>
          <p>Stripe, Inc. announced Thursday that Jane Doe will join as its new chief financial officer.</p>
          <p>The appointment marks a pivot toward a more financially disciplined era for the payments firm.</p>
        </section>
      </body>
    </html>
  `;

  it('extracts title, author, publishedAt, body, canonical URL', () => {
    const $ = loadHtml(ARTICLE_HTML);
    const parsed = parseWsjArticle($, 'https://www.wsj.com/business/stripe-jane-doe');
    expect(parsed.title).toBe('Stripe names Jane Doe CFO');
    expect(parsed.author).toBe('Reporter McReport');
    expect(parsed.publishedAt).toBe(new Date('2026-01-15T10:00:00Z').toISOString());
    expect(parsed.body).toContain('Jane Doe will join');
    expect(parsed.body).toContain('financially disciplined');
    expect(parsed.canonicalUrl).toBe('https://www.wsj.com/business/stripe-jane-doe');
  });

  it('detects paywall when RegistrationWall is present with thin body', () => {
    const paywallHtml = `
      <html><body>
        <div data-component="RegistrationWall">Subscribe to continue reading</div>
        <section subscriber-content><p>Short preview</p></section>
      </body></html>
    `;
    const $ = loadHtml(paywallHtml);
    expect(detectWsjPaywall($, paywallHtml, 200)).toBe(true);
  });

  it('does not fire paywall on a full free article', () => {
    const $ = loadHtml(ARTICLE_HTML);
    expect(detectWsjPaywall($, ARTICLE_HTML, 200)).toBe(false);
  });
});
