// TechCrunch connector.
//
// TechCrunch runs on WordPress. `?s=<query>` search is server-rendered and
// yields `h2.post-block__title a` anchors. Article bodies live under
// `.article-content`. TechCrunch is free-to-read — paywall heuristic stays
// defensive but rarely triggers.

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

export const TECHCRUNCH_HOST = 'techcrunch.com';

export function buildTechcrunchSearchUrl(entity: {
  kind: 'person' | 'company';
  name: string;
  domain?: string;
}): string {
  const parts = [entity.name];
  if (entity.kind === 'company' && entity.domain) parts.push(entity.domain);
  const q = encodeURIComponent(parts.join(' '));
  return `https://${TECHCRUNCH_HOST}/?s=${q}`;
}

export function parseTechcrunchSearchLinks(
  $: CheerioAPI,
  _baseUrl: string
): SearchHit[] {
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  // Classic TC search result: `h2.post-block__title > a`.
  $(
    'h2.post-block__title a, h3.loop-card__title a, article a.post-block__title__link, a.wp-block-tc23-post-picker'
  ).each((_i, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const url = href.startsWith('http') ? href : `https://${TECHCRUNCH_HOST}${href}`;
    if (seen.has(url)) return;
    seen.add(url);
    const title = $(el).text().trim() || null;
    hits.push({ url, title });
  });
  return hits;
}

export function parseTechcrunchArticle(
  $: CheerioAPI,
  articleUrl: string
): ParsedArticle {
  const title =
    $('h1.article__title, h1.wp-block-post-title, h1').first().text().trim() ||
    extractTitleFallback($) ||
    null;
  const body =
    collectBody($, '.article-content, .entry-content, article') ?? null;
  const publishedAt = metaPublishedAt($);
  const author = metaAuthor($, [
    'a.article__byline__author',
    '.article__byline a',
    '.wp-block-post-author-name a',
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

export function detectTechcrunchPaywall(
  _$: CheerioAPI,
  _html: string,
  _status: number
): boolean {
  // Free site — we never expect a paywall. A 403 from the HTTP layer still
  // triggers the paywall graceful path via the shell.
  return false;
}

export const TECHCRUNCH_ADAPTER: NewsSiteAdapter = {
  origin: 'techcrunch',
  label: 'TechCrunch',
  host: TECHCRUNCH_HOST,
  defaultMaxArticles: 20,
  articleCap: 20,
  buildSearchUrl: buildTechcrunchSearchUrl,
  parseSearchLinks: parseTechcrunchSearchLinks,
  parseArticle: parseTechcrunchArticle,
  detectPaywall: detectTechcrunchPaywall,
};

export const techcrunchConnector: SourceConnector<NewsConnectorInput> = {
  sourceType: 'news',
  label: 'TechCrunch',
  invoke(input: NewsConnectorInput, ctx: ConnectorContext): Promise<ConnectorResult> {
    return runNewsConnector(TECHCRUNCH_ADAPTER, input, ctx);
  },
};
