// Reuters connector.
//
// Reuters exposes a first-party search at `/site-search/?query=<q>`. The
// template renders server-side and includes article links in
// `a[data-testid="Heading"]`. Reuters is typically not paywalled — we keep
// a paywall heuristic for edge-case premium content.

import type { CheerioAPI } from 'cheerio';
import type { SourceConnector } from '../../types';
import type { ConnectorContext, ConnectorResult } from '../../types';
import {
  collectBody,
  extractTitleFallback,
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

export const REUTERS_HOST = 'www.reuters.com';

export function buildReutersSearchUrl(entity: {
  kind: 'person' | 'company';
  name: string;
  domain?: string;
}): string {
  const parts = [entity.name];
  if (entity.kind === 'company' && entity.domain) parts.push(entity.domain);
  const q = encodeURIComponent(parts.join(' '));
  return `https://${REUTERS_HOST}/site-search/?query=${q}&offset=0`;
}

export function parseReutersSearchLinks(
  $: CheerioAPI,
  _baseUrl: string
): SearchHit[] {
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  // Reuters search results anchor is `a[data-testid="Heading"]` or
  // `a[data-testid="TitleLink"]` on the new template; both live under
  // `li[class*="search-results__item"]`.
  $('a[data-testid="Heading"], a[data-testid="TitleLink"], li[class*="search-results"] a').each(
    (_i, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      const url = href.startsWith('http')
        ? href
        : `https://${REUTERS_HOST}${href.startsWith('/') ? href : `/${href}`}`;
      if (seen.has(url)) return;
      seen.add(url);
      const title = $(el).text().trim() || null;
      hits.push({ url, title });
    }
  );
  return hits;
}

export function parseReutersArticle(
  $: CheerioAPI,
  articleUrl: string
): ParsedArticle {
  const title =
    $('h1[data-testid="Heading"]').first().text().trim() ||
    $('h1').first().text().trim() ||
    extractTitleFallback($) ||
    null;

  const body =
    collectBody(
      $,
      'div[class*="article-body__content"], div[data-testid="paragraph"], article'
    ) ?? null;

  const publishedAt = metaPublishedAt($);
  const author = metaAuthor($, [
    'a[rel="author"]',
    'a[data-testid="AuthorLink"]',
    '.author-name',
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

export function detectReutersPaywall(
  $: CheerioAPI,
  html: string,
  _status: number
): boolean {
  if ($('.paywall, [data-testid="paywall"]').length > 0) return true;
  if (/Reuters Pro|subscribe to access/i.test(html)) {
    const bodyText = $(
      'div[class*="article-body__content"], div[data-testid="paragraph"]'
    ).text();
    if (bodyText.trim().split(/\s+/).length < 50) return true;
  }
  return false;
}

export const REUTERS_ADAPTER: NewsSiteAdapter = {
  origin: 'reuters',
  label: 'Reuters',
  host: REUTERS_HOST,
  defaultMaxArticles: 10,
  articleCap: 10,
  buildSearchUrl: buildReutersSearchUrl,
  parseSearchLinks: parseReutersSearchLinks,
  parseArticle: parseReutersArticle,
  detectPaywall: detectReutersPaywall,
};

export const reutersConnector: SourceConnector<NewsConnectorInput> = {
  sourceType: 'news',
  label: 'Reuters',
  invoke(input: NewsConnectorInput, ctx: ConnectorContext): Promise<ConnectorResult> {
    return runNewsConnector(REUTERS_ADAPTER, input, ctx);
  },
};
