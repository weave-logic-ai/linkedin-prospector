// Bloomberg connector.
//
// Bloomberg has a first-party search page but it hard-blocks non-browser
// clients with a "are you a human?" interstitial. We therefore use a
// Google News `site:bloomberg.com` RSS query for discovery, same as WSJ.
// Articles are frequently paywalled (especially Businessweek); we degrade
// gracefully on 402/403 or when the page body is the paywall shell.

import type { CheerioAPI } from 'cheerio';
import type { SourceConnector } from '../../types';
import type { ConnectorContext, ConnectorResult } from '../../types';
import {
  collectBody,
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

export const BLOOMBERG_HOST = 'www.bloomberg.com';

export function buildBloombergSearchUrl(entity: {
  kind: 'person' | 'company';
  name: string;
  domain?: string;
}): string {
  return googleNewsSiteQuery(BLOOMBERG_HOST, entity);
}

export function parseBloombergSearchLinks($: CheerioAPI): SearchHit[] {
  const hits: SearchHit[] = [];
  $('item').each((_i, el) => {
    const link = $(el).find('link').first().text().trim();
    const title = $(el).find('title').first().text().trim();
    const guid = $(el).find('guid').first().text().trim();
    if (!link && !guid) return;
    const candidate = guid && /bloomberg\.com/.test(guid) ? guid : link;
    hits.push({ url: candidate, title: title || null });
  });
  return hits;
}

export function parseBloombergArticle(
  $: CheerioAPI,
  articleUrl: string
): ParsedArticle {
  // Bloomberg headlines live in `h1[data-type="headline"]` on the article
  // template; Businessweek uses `h1.lede-text-only__hed`. Fall back to h1.
  const title =
    $('h1[data-type="headline"]').first().text().trim() ||
    $('h1.lede-text-only__hed').first().text().trim() ||
    $('h1').first().text().trim() ||
    extractTitleFallback($) ||
    null;

  const body =
    collectBody(
      $,
      '.body-content, .body-copy, article [data-component="body"], article'
    ) ?? null;

  const publishedAt = metaPublishedAt($);
  const author = metaAuthor($, [
    '.author-v2 a',
    '.author-v2',
    'a[data-component="byline"]',
    '.byline',
  ]);
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

export function detectBloombergPaywall(
  $: CheerioAPI,
  html: string,
  _status: number
): boolean {
  if ($('[data-component="paywall"]').length > 0) return true;
  if ($('.fence-body, .fence-lede, .paywall').length > 0) return true;
  // Bloomberg's "confirm you are human" interstitial.
  if (/are you a robot|confirm you are human/i.test(html)) return true;
  return false;
}

export const BLOOMBERG_ADAPTER: NewsSiteAdapter = {
  origin: 'bloomberg',
  label: 'Bloomberg',
  host: BLOOMBERG_HOST,
  defaultMaxArticles: 10,
  articleCap: 10,
  buildSearchUrl: buildBloombergSearchUrl,
  parseSearchLinks: parseBloombergSearchLinks,
  parseArticle: parseBloombergArticle,
  detectPaywall: detectBloombergPaywall,
};

export const bloombergConnector: SourceConnector<NewsConnectorInput> = {
  sourceType: 'news',
  label: 'Bloomberg',
  invoke(input: NewsConnectorInput, ctx: ConnectorContext): Promise<ConnectorResult> {
    return runNewsConnector(BLOOMBERG_ADAPTER, input, ctx);
  },
};
