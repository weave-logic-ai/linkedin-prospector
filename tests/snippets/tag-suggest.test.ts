// URL-based tag auto-suggest tests.
//
// Pins the Phase 1.5 WS-3 acceptance item §16 bullet 6 ("Tag auto-suggestion
// defaults correctly for EDGAR and Wayback URLs"). The sidepanel duplicates
// this function locally; both copies must agree on these cases.

import { suggestTagSlugsForUrl } from '@/lib/snippets/tag-suggest';

const SEEDED = new Set([
  'provenance/wayback',
  'filing/sec-10k',
  'filing/sec-10q',
  'filing/sec-8k',
  'filing/sec-13f',
  'filing/sec-proxy',
  'filing/court',
  'news/article',
]);

describe('suggestTagSlugsForUrl', () => {
  it('pre-selects provenance/wayback for web.archive.org URLs', () => {
    expect(
      suggestTagSlugsForUrl(
        'https://web.archive.org/web/20240101000000/https://example.com/',
        SEEDED
      )
    ).toEqual(['provenance/wayback']);
  });

  it('pre-selects filing/sec-10k when the SEC URL includes 10-K', () => {
    expect(
      suggestTagSlugsForUrl(
        'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=10-K',
        SEEDED
      )
    ).toEqual(['filing/sec-10k']);
  });

  it('pre-selects filing/sec-10q for a 10-Q filing URL', () => {
    expect(
      suggestTagSlugsForUrl(
        'https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/aapl-20240630-10-Q.htm',
        SEEDED
      )
    ).toEqual(['filing/sec-10q']);
  });

  it('pre-selects filing/sec-8k for an 8-K filing URL', () => {
    expect(
      suggestTagSlugsForUrl(
        'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=8-K&owner=include',
        SEEDED
      )
    ).toEqual(['filing/sec-8k']);
  });

  it('pre-selects filing/sec-proxy when URL mentions DEF 14A', () => {
    expect(
      suggestTagSlugsForUrl(
        'https://www.sec.gov/Archives/edgar/data/320193/000032019324/def14a.htm',
        SEEDED
      )
    ).toEqual(['filing/sec-proxy']);
  });

  it('returns an empty array for URLs outside the known patterns', () => {
    expect(
      suggestTagSlugsForUrl('https://news.example.com/article/123', SEEDED)
    ).toEqual([]);
  });

  it('never returns a slug absent from the known set', () => {
    // Slimmed tenant — no filing/sec-10k available.
    const custom = new Set(['provenance/wayback']);
    expect(
      suggestTagSlugsForUrl(
        'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=10-K',
        custom
      )
    ).toEqual([]);
  });

  it('returns an empty array for invalid URLs without throwing', () => {
    expect(suggestTagSlugsForUrl('not a url', SEEDED)).toEqual([]);
    expect(suggestTagSlugsForUrl('', SEEDED)).toEqual([]);
  });
});
