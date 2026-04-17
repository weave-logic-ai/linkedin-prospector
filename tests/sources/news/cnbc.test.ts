// Phase 3 Track G — CNBC connector unit tests.

import {
  buildCnbcSearchUrl,
  parseCnbcSearchLinks,
  parseCnbcArticle,
  detectCnbcPaywall,
  CNBC_HOST,
  CNBC_ADAPTER,
} from '@/lib/sources/connectors/news/cnbc';
import { loadHtml } from '@/lib/sources/connectors/news/shared';

describe('CNBC connector — URL formation', () => {
  it('builds the CNBC /search/?qsearchterm= URL', () => {
    const url = buildCnbcSearchUrl({
      kind: 'company',
      name: 'Stripe',
      domain: 'stripe.com',
    });
    expect(url.startsWith('https://www.cnbc.com/search/?')).toBe(true);
    // CNBC SSR uses qsearchterm.
    expect(url).toContain('qsearchterm=');
    const qs = decodeURIComponent(url.split('qsearchterm=')[1]!);
    expect(qs).toContain('Stripe');
    expect(qs).toContain('stripe.com');
  });

  it('exposes cap = 15', () => {
    expect(CNBC_ADAPTER.articleCap).toBe(15);
    expect(CNBC_ADAPTER.host).toBe(CNBC_HOST);
  });
});

describe('CNBC connector — search + parse', () => {
  it('finds search result anchors', () => {
    const html = `
      <html><body>
        <div class="SearchResult-searchResult">
          <a class="resultlink" href="https://www.cnbc.com/2026/01/15/stripe-ipo-watch.html">Stripe IPO Watch</a>
        </div>
        <div>
          <a data-test="SearchResult-titleLink" href="/2026/01/16/stripe-moves.html">Stripe moves</a>
        </div>
      </body></html>
    `;
    const $ = loadHtml(html);
    const hits = parseCnbcSearchLinks($, 'https://www.cnbc.com/search/?query=stripe');
    expect(hits.map((h) => h.url)).toEqual(
      expect.arrayContaining([
        'https://www.cnbc.com/2026/01/15/stripe-ipo-watch.html',
        'https://www.cnbc.com/2026/01/16/stripe-moves.html',
      ])
    );
  });

  it('parses an article body', () => {
    const html = `
      <html><head>
        <meta property="article:published_time" content="2026-01-15T09:00:00Z" />
        <meta name="author" content="CNBC Reporter" />
      </head><body>
        <h1 class="ArticleHeader-headline">Stripe IPO Watch</h1>
        <div class="ArticleBody-articleBody">
          <div class="group"><p>Stripe may finally file for an IPO this year, analysts say.</p></div>
          <div class="group"><p>The payments firm has delayed plans multiple times since 2022.</p></div>
        </div>
      </body></html>
    `;
    const $ = loadHtml(html);
    const parsed = parseCnbcArticle($, 'https://www.cnbc.com/2026/01/15/stripe-ipo-watch.html');
    expect(parsed.title).toBe('Stripe IPO Watch');
    expect(parsed.author).toBe('CNBC Reporter');
    expect(parsed.body).toContain('file for an IPO');
  });

  it('detects CNBC Pro paywall only when body is thin', () => {
    const gatedHtml = `
      <html><body>
        <div class="ProPaywall"></div>
        <div class="ArticleBody-articleBody">short</div>
      </body></html>
    `;
    const $ = loadHtml(gatedHtml);
    expect(detectCnbcPaywall($, gatedHtml, 200)).toBe(true);
  });
});
