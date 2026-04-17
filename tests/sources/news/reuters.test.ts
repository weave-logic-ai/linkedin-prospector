// Phase 3 Track G — Reuters connector unit tests.

import {
  buildReutersSearchUrl,
  parseReutersSearchLinks,
  parseReutersArticle,
  detectReutersPaywall,
  REUTERS_HOST,
  REUTERS_ADAPTER,
} from '@/lib/sources/connectors/news/reuters';
import { loadHtml } from '@/lib/sources/connectors/news/shared';

describe('Reuters connector — URL formation', () => {
  it('builds a first-party Reuters search URL with query params', () => {
    const url = buildReutersSearchUrl({
      kind: 'company',
      name: 'Stripe',
      domain: 'stripe.com',
    });
    expect(url.startsWith('https://www.reuters.com/site-search/?query=')).toBe(true);
    const q = decodeURIComponent(url.split('query=')[1]!.split('&')[0]!);
    expect(q).toContain('Stripe');
    expect(q).toContain('stripe.com');
  });

  it('omits domain for person entities', () => {
    const url = buildReutersSearchUrl({ kind: 'person', name: 'Jane Doe' });
    const q = decodeURIComponent(url.split('query=')[1]!.split('&')[0]!);
    expect(q).toBe('Jane Doe');
  });

  it('exposes Reuters cap = 10', () => {
    expect(REUTERS_ADAPTER.host).toBe(REUTERS_HOST);
    expect(REUTERS_ADAPTER.articleCap).toBe(10);
  });
});

describe('Reuters connector — search + article parse', () => {
  it('parses search hits from the search-results DOM', () => {
    const html = `
      <html><body>
        <ul>
          <li class="search-results__item-abc">
            <a data-testid="Heading" href="/business/stripe-ceo-steps-down/">Stripe CEO steps down</a>
          </li>
          <li class="search-results__item-def">
            <a data-testid="TitleLink" href="https://www.reuters.com/markets/stripe-valuation/">Stripe valuation</a>
          </li>
        </ul>
      </body></html>
    `;
    const $ = loadHtml(html);
    const hits = parseReutersSearchLinks($, 'https://www.reuters.com/site-search/?query=stripe');
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits.map((h) => h.url)).toContain(
      'https://www.reuters.com/business/stripe-ceo-steps-down/'
    );
    expect(hits.map((h) => h.url)).toContain(
      'https://www.reuters.com/markets/stripe-valuation/'
    );
  });

  it('parses article headline, byline, body, date', () => {
    const html = `
      <html><head>
        <meta property="article:published_time" content="2026-03-10T14:00:00Z" />
        <link rel="canonical" href="https://www.reuters.com/markets/stripe-valuation/" />
      </head><body>
        <h1 data-testid="Heading">Stripe Valuation Jumps 40%</h1>
        <a rel="author">Analyst Smith</a>
        <div class="article-body__content">
          <p>Stripe's private valuation jumped amid investor optimism.</p>
          <p>Sources confirmed the raise with Reuters on Tuesday.</p>
        </div>
      </body></html>
    `;
    const $ = loadHtml(html);
    const parsed = parseReutersArticle($, 'https://www.reuters.com/markets/stripe-valuation/');
    expect(parsed.title).toBe('Stripe Valuation Jumps 40%');
    expect(parsed.author).toBe('Analyst Smith');
    expect(parsed.body).toContain('valuation jumped');
    expect(parsed.publishedAt).toBe(new Date('2026-03-10T14:00:00Z').toISOString());
  });

  it('paywall heuristic is off by default for free articles', () => {
    const html = `<html><body><div class="article-body__content"><p>${'x '.repeat(200)}</p></div></body></html>`;
    const $ = loadHtml(html);
    expect(detectReutersPaywall($, html, 200)).toBe(false);
  });
});
