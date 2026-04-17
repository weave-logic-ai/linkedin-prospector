// CNBC connector.
//
// CNBC's search endpoint (`/search/?query=<q>&qsearchterm=<q>`) renders
// result links server-side. Article bodies use `.ArticleBody-articleBody`
// with paragraphs under `.group`. CNBC is free-to-read; we include the
// Pro-only heuristic for completeness.

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

export const CNBC_HOST = 'www.cnbc.com';

export function buildCnbcSearchUrl(entity: {
  kind: 'person' | 'company';
  name: string;
  domain?: string;
}): string {
  const parts = [entity.name];
  if (entity.kind === 'company' && entity.domain) parts.push(entity.domain);
  const q = encodeURIComponent(parts.join(' '));
  // `qsearchterm` is the param CNBC's SSR reads; `query` is a shadowed
  // client-side filter we also set for completeness.
  return `https://${CNBC_HOST}/search/?query=${q}&qsearchterm=${q}`;
}

export function parseCnbcSearchLinks(
  $: CheerioAPI,
  _baseUrl: string
): SearchHit[] {
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  $(
    '.SearchResult-searchResult a.resultlink, .Card-titleContainer a, a[data-test="SearchResult-titleLink"]'
  ).each((_i, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const url = href.startsWith('http') ? href : `https://${CNBC_HOST}${href}`;
    if (seen.has(url)) return;
    seen.add(url);
    const title = $(el).text().trim() || null;
    hits.push({ url, title });
  });
  return hits;
}

export function parseCnbcArticle(
  $: CheerioAPI,
  articleUrl: string
): ParsedArticle {
  const title =
    $('h1.ArticleHeader-headline').first().text().trim() ||
    $('h1').first().text().trim() ||
    extractTitleFallback($) ||
    null;
  const body =
    collectBody($, '.ArticleBody-articleBody, .group, article') ?? null;
  const publishedAt = metaPublishedAt($);
  const author = metaAuthor($, [
    '.Author-authorName',
    'a.Author-authorName',
    '.byline-name',
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

export function detectCnbcPaywall(
  $: CheerioAPI,
  html: string,
  _status: number
): boolean {
  if ($('.ProArticle-proLogin, .ProPaywall').length > 0) return true;
  if (/CNBC Pro subscribers|Subscribe to CNBC Pro/i.test(html)) {
    const bodyText = $('.ArticleBody-articleBody').text();
    if (bodyText.trim().split(/\s+/).length < 50) return true;
  }
  return false;
}

export const CNBC_ADAPTER: NewsSiteAdapter = {
  origin: 'cnbc',
  label: 'CNBC',
  host: CNBC_HOST,
  defaultMaxArticles: 15,
  articleCap: 15,
  buildSearchUrl: buildCnbcSearchUrl,
  parseSearchLinks: parseCnbcSearchLinks,
  parseArticle: parseCnbcArticle,
  detectPaywall: detectCnbcPaywall,
};

export const cnbcConnector: SourceConnector<NewsConnectorInput> = {
  sourceType: 'news',
  label: 'CNBC',
  invoke(input: NewsConnectorInput, ctx: ConnectorContext): Promise<ConnectorResult> {
    return runNewsConnector(CNBC_ADAPTER, input, ctx);
  },
};
