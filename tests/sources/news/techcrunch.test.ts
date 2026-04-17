// Phase 3 Track G — TechCrunch connector unit tests.

import {
  buildTechcrunchSearchUrl,
  parseTechcrunchSearchLinks,
  parseTechcrunchArticle,
  detectTechcrunchPaywall,
  TECHCRUNCH_HOST,
  TECHCRUNCH_ADAPTER,
} from '@/lib/sources/connectors/news/techcrunch';
import { loadHtml } from '@/lib/sources/connectors/news/shared';

describe('TechCrunch connector — URL formation', () => {
  it('builds a WordPress ?s= search URL', () => {
    const url = buildTechcrunchSearchUrl({
      kind: 'company',
      name: 'Stripe',
      domain: 'stripe.com',
    });
    expect(url.startsWith('https://techcrunch.com/?s=')).toBe(true);
    const q = decodeURIComponent(url.split('s=')[1]!);
    expect(q).toContain('Stripe');
    expect(q).toContain('stripe.com');
  });

  it('exposes cap = 20', () => {
    expect(TECHCRUNCH_ADAPTER.articleCap).toBe(20);
    expect(TECHCRUNCH_ADAPTER.host).toBe(TECHCRUNCH_HOST);
  });
});

describe('TechCrunch connector — search + parse', () => {
  it('pulls post-block titles from a search-results page', () => {
    const html = `
      <html><body>
        <h2 class="post-block__title">
          <a href="https://techcrunch.com/2026/01/04/stripe-adds-india/">Stripe adds India</a>
        </h2>
        <h3 class="loop-card__title">
          <a href="/2026/01/05/stripe-ai-feature/">Stripe AI feature</a>
        </h3>
      </body></html>
    `;
    const $ = loadHtml(html);
    const hits = parseTechcrunchSearchLinks($, 'https://techcrunch.com/?s=stripe');
    expect(hits.map((h) => h.url)).toEqual(
      expect.arrayContaining([
        'https://techcrunch.com/2026/01/04/stripe-adds-india/',
        'https://techcrunch.com/2026/01/05/stripe-ai-feature/',
      ])
    );
  });

  it('parses an article with title/body/meta', () => {
    const html = `
      <html><head>
        <meta property="article:published_time" content="2026-01-04T09:30:00Z" />
        <meta name="author" content="TC Reporter" />
      </head><body>
        <h1 class="article__title">Stripe adds India</h1>
        <div class="article-content">
          <p>Stripe announced expanded support for India-based merchants Thursday.</p>
          <p>The launch follows a year of regulatory back-and-forth.</p>
        </div>
      </body></html>
    `;
    const $ = loadHtml(html);
    const parsed = parseTechcrunchArticle($, 'https://techcrunch.com/2026/01/04/stripe-adds-india/');
    expect(parsed.title).toBe('Stripe adds India');
    expect(parsed.author).toBe('TC Reporter');
    expect(parsed.body).toContain('India-based merchants');
    expect(parsed.publishedAt).toBe(new Date('2026-01-04T09:30:00Z').toISOString());
  });

  it('never detects a paywall for TechCrunch', () => {
    const html = `<html><body><p>anything</p></body></html>`;
    const $ = loadHtml(html);
    expect(detectTechcrunchPaywall($, html, 200)).toBe(false);
  });
});
