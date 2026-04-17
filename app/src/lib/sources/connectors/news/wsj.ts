// Wall Street Journal connector.
//
// WSJ's first-party search redirects unauthenticated requests to a
// login wall, so we use a Google News `site:wsj.com` query to discover
// article URLs. Articles themselves are often paywalled — we treat that
// gracefully by recording {title, canonical_url, behind_paywall:true}.
//
// Article selectors follow the current WSJ template (Jan 2026): headline in
// `h1[itemprop="headline"]`, body under `section[subscriber-content]`, and
// byline in `div.byline` / `a.byline-link`.

import type { CheerioAPI } from 'cheerio';
import type { SourceConnector } from '../../types';
import type { ConnectorContext, ConnectorResult } from '../../types';
import {
  collectBody,
  deriveMultiplier,
  extractTitleFallback,
  googleNewsSiteQuery,
  metaAuthor,
  metaCanonicalUrl,
  metaPublishedAt,
  parseViewCountFromJsonLd,
  runNewsConnector,
  type NewsConnectorInput,
  type NewsSiteAdapter,
  type ParsedArticle,
  type SearchHit,
} from './shared';

export const WSJ_HOST = 'www.wsj.com';

export function buildWsjSearchUrl(entity: {
  kind: 'person' | 'company';
  name: string;
  domain?: string;
}): string {
  return googleNewsSiteQuery(WSJ_HOST, entity);
}

/** Parse a Google News RSS response — XML with <item><link> entries. */
export function parseWsjSearchLinks($: CheerioAPI): SearchHit[] {
  const hits: SearchHit[] = [];
  // Google News RSS: <item><title>, <link> (wrapped in CDATA sometimes).
  $('item').each((_i, el) => {
    const link = $(el).find('link').first().text().trim();
    const title = $(el).find('title').first().text().trim();
    if (!link) return;
    // RSS <link> for Google News returns a redirector URL; we keep it and let
    // canonicalizeUrl + host check filter — but most commonly the enclosed
    // `<guid>` or the `<link>` ends with the publisher URL. Use guid when
    // it's a direct wsj.com URL.
    const guid = $(el).find('guid').first().text().trim();
    const candidate = guid && /wsj\.com/.test(guid) ? guid : link;
    hits.push({ url: candidate, title: title || null });
  });
  return hits;
}

export function parseWsjArticle(
  $: CheerioAPI,
  articleUrl: string
): ParsedArticle {
  const title =
    $('h1[itemprop="headline"]').first().text().trim() ||
    extractTitleFallback($) ||
    null;
  const body =
    collectBody($, 'section[subscriber-content], .article-content, article') ??
    null;
  const publishedAt = metaPublishedAt($);
  const author = metaAuthor($, ['a.byline-link', 'div.byline', '.byline']);
  const viewCount = parseViewCountFromJsonLd($);
  return {
    title,
    publishedAt,
    author,
    body,
    canonicalUrl: metaCanonicalUrl($, articleUrl),
    viewCount: viewCount ?? null,
  };
}

export function detectWsjPaywall(
  $: CheerioAPI,
  html: string,
  _status: number
): boolean {
  // Heuristics: subscribe-wall component, or empty body under subscriber-content.
  if ($('[data-component="RegistrationWall"]').length > 0) return true;
  if ($('.snippet-promotion, .wsj-snippet-body').length > 0) return true;
  if (/paywall|subscriber-only|Subscribe to continue reading/i.test(html)) {
    // Double-check — many free articles include the word "subscribe" in
    // the masthead, so also require that body content is thin.
    const bodyWords = ($('section[subscriber-content]').text() ?? '')
      .split(/\s+/)
      .filter(Boolean).length;
    if (bodyWords < 50) return true;
  }
  return false;
}

export const WSJ_ADAPTER: NewsSiteAdapter = {
  origin: 'wsj',
  label: 'WSJ',
  host: WSJ_HOST,
  defaultMaxArticles: 5,
  articleCap: 5,
  buildSearchUrl: buildWsjSearchUrl,
  parseSearchLinks: (cheerioApi) => parseWsjSearchLinks(cheerioApi),
  parseArticle: parseWsjArticle,
  detectPaywall: detectWsjPaywall,
};

export const wsjConnector: SourceConnector<NewsConnectorInput> = {
  sourceType: 'news',
  label: 'WSJ',
  invoke(input: NewsConnectorInput, ctx: ConnectorContext): Promise<ConnectorResult> {
    return runNewsConnector(WSJ_ADAPTER, input, ctx);
  },
};

// Re-export deriveMultiplier for test ergonomics (the operator brief asks for
// a per-connector unit test on URL formation + body parse).
export { deriveMultiplier };
