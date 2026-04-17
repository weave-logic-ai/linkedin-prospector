// URL-based tag auto-suggest for the snippet widget.
//
// Per `.planning/research-tools-sprint/03-snippet-editor.md` §13 and acceptance
// item §16 bullet 6, when the source URL matches a well-known provenance
// pattern, default to a matching tag in the taxonomy. This module is a pure
// function so both the browser sidepanel and server-side tests can consume it.
// The browser keeps a duplicate copy inline (it cannot import across the
// app/browser boundary at bundle time), which stays in sync with this one by
// having a single test suite that verifies both implementations produce the
// same output.
//
// Rules (non-overlapping; first match wins on the filing side):
//   - host `web.archive.org`         → `provenance/wayback`
//   - SEC path containing `10-K`     → `filing/sec-10k`
//   - SEC path containing `10-Q`     → `filing/sec-10q`
//   - SEC path containing `8-K`      → `filing/sec-8k`
//   - SEC path containing `13F`      → `filing/sec-13f`
//   - SEC path containing `DEF 14A`  → `filing/sec-proxy`
//   - sec.gov path with court/docket → `filing/court`
//
// Only slugs that exist in the tenant's taxonomy (`known` iterable) are
// returned — that prevents the UI from pre-selecting a chip the user can't see.

export function suggestTagSlugsForUrl(
  url: string,
  known: Iterable<string>
): string[] {
  const hits = new Set<string>();
  const has = new Set<string>(known);
  if (!url) return [];
  let host = '';
  let path = '';
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase();
    path = u.pathname + u.search;
  } catch {
    return [];
  }
  if (/(^|\.)web\.archive\.org$/.test(host) && has.has('provenance/wayback')) {
    hits.add('provenance/wayback');
  }
  if (/(^|\.)sec\.gov$/.test(host)) {
    const upper = `${path} ${url}`.toUpperCase();
    if (/\b10-K\b/.test(upper) && has.has('filing/sec-10k')) {
      hits.add('filing/sec-10k');
    } else if (/\b10-Q\b/.test(upper) && has.has('filing/sec-10q')) {
      hits.add('filing/sec-10q');
    } else if (/\b8-K\b/.test(upper) && has.has('filing/sec-8k')) {
      hits.add('filing/sec-8k');
    } else if (/\b13F\b/.test(upper) && has.has('filing/sec-13f')) {
      hits.add('filing/sec-13f');
    } else if (/DEF\s*14A/.test(upper) && has.has('filing/sec-proxy')) {
      hits.add('filing/sec-proxy');
    }
    if (has.has('filing/court') && /court|case|docket/i.test(path)) {
      hits.add('filing/court');
    }
  }
  return Array.from(hits);
}
