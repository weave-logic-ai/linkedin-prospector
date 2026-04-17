// Phase 3 Track G — Bloomberg connector unit tests.

import {
  buildBloombergSearchUrl,
  parseBloombergSearchLinks,
  parseBloombergArticle,
  detectBloombergPaywall,
  BLOOMBERG_HOST,
  BLOOMBERG_ADAPTER,
} from '@/lib/sources/connectors/news/bloomberg';
import { loadHtml } from '@/lib/sources/connectors/news/shared';

describe('Bloomberg connector — URL formation', () => {
  it('uses the Google News site: query for Bloomberg', () => {
    const url = buildBloombergSearchUrl({
      kind: 'company',
      name: 'Stripe',
      domain: 'stripe.com',
    });
    const q = decodeURIComponent(url.split('q=')[1]!.split('&')[0]!);
    expect(q).toContain('site:www.bloomberg.com');
    expect(q).toContain('"Stripe"');
    expect(q).toContain('"stripe.com"');
  });

  it('exposes Bloomberg host + cap = 10', () => {
    expect(BLOOMBERG_ADAPTER.host).toBe(BLOOMBERG_HOST);
    expect(BLOOMBERG_ADAPTER.articleCap).toBe(10);
  });
});

describe('Bloomberg connector — search + article parse', () => {
  it('parses search items from a Google News RSS fixture', () => {
    const xml = `<?xml version="1.0"?><rss><channel>
      <item>
        <title>Stripe IPO signals</title>
        <link>https://news.google.com/rss/articles/abc</link>
        <guid>https://www.bloomberg.com/news/articles/stripe-ipo</guid>
      </item>
    </channel></rss>`;
    const $ = loadHtml(xml, { xmlMode: true });
    const hits = parseBloombergSearchLinks($);
    expect(hits).toHaveLength(1);
    expect(hits[0].url).toBe('https://www.bloomberg.com/news/articles/stripe-ipo');
  });

  it('extracts headline and body from an article', () => {
    const html = `
      <html><head>
        <meta property="og:title" content="Stripe Eyes Public Listing" />
        <meta property="article:published_time" content="2026-02-01T08:00:00Z" />
        <meta name="author" content="Market Writer" />
        <link rel="canonical" href="https://www.bloomberg.com/news/articles/stripe-ipo" />
      </head><body>
        <h1 data-type="headline">Stripe Eyes Public Listing</h1>
        <div class="body-content">
          <p>Stripe, which handles billions of dollars in payments, is preparing for an IPO.</p>
          <p>The company has tapped banks for a 2026 offering.</p>
        </div>
      </body></html>
    `;
    const $ = loadHtml(html);
    const parsed = parseBloombergArticle($, 'https://www.bloomberg.com/news/articles/stripe-ipo');
    expect(parsed.title).toBe('Stripe Eyes Public Listing');
    expect(parsed.author).toBe('Market Writer');
    expect(parsed.body).toContain('preparing for an IPO');
    expect(parsed.canonicalUrl).toBe('https://www.bloomberg.com/news/articles/stripe-ipo');
  });

  it('detects Bloomberg paywall component', () => {
    const html = `<html><body><div data-component="paywall"></div></body></html>`;
    const $ = loadHtml(html);
    expect(detectBloombergPaywall($, html, 200)).toBe(true);
  });

  it('detects anti-bot interstitial', () => {
    const html = `<html><body>Are you a robot? Confirm you are human.</body></html>`;
    const $ = loadHtml(html);
    expect(detectBloombergPaywall($, html, 200)).toBe(true);
  });
});
