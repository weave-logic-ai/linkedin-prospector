// Source connector registry.
//
// Phase 2 Track E ships Wayback + EDGAR. Phase 3 Track F adds the RSS family
// (core RSS, Google News fallback, corporate blog discovery). Phase 3 Track G
// adds the podcast connector plus five site-specific news scrapers that route
// by `origin` within the 'news' source_type.

import type { SourceConnector, SourceType } from './types';
import { waybackConnector } from './connectors/wayback';
import { edgarConnector } from './connectors/edgar';
import { rssConnector } from './connectors/rss';
import { googleNewsConnector } from './connectors/google-news';
import { corporateBlogConnector } from './connectors/corporate-blog';
import { podcastConnector } from './connectors/podcast';
import { wsjConnector } from './connectors/news/wsj';
import { bloombergConnector } from './connectors/news/bloomberg';
import { reutersConnector } from './connectors/news/reuters';
import { techcrunchConnector } from './connectors/news/techcrunch';
import { cnbcConnector } from './connectors/news/cnbc';
import type { NewsOrigin } from './connectors/news/shared';

const REGISTRY: Partial<Record<SourceType, SourceConnector<unknown>>> = {
  wayback: waybackConnector as SourceConnector<unknown>,
  edgar: edgarConnector as SourceConnector<unknown>,
  rss: rssConnector as SourceConnector<unknown>,
  // Google News lives under the 'news' source_type per §7.2; targeted
  // scrapers (WSJ/Bloomberg/Reuters/TechCrunch/CNBC) route via
  // NEWS_CONNECTORS below using the `origin` discriminator. News-sweep cron
  // tries NEWS_CONNECTORS first and falls back to googleNewsConnector.
  news: googleNewsConnector as SourceConnector<unknown>,
  blog: corporateBlogConnector as SourceConnector<unknown>,
  podcast: podcastConnector as SourceConnector<unknown>,
};

/**
 * Phase 3 Track G — targeted per-site news connectors. Keyed by `origin`
 * (which is also the per-connector sub-flag name).
 */
export const NEWS_CONNECTORS: Record<NewsOrigin, SourceConnector<unknown>> = {
  wsj: wsjConnector as SourceConnector<unknown>,
  bloomberg: bloombergConnector as SourceConnector<unknown>,
  reuters: reutersConnector as SourceConnector<unknown>,
  techcrunch: techcrunchConnector as SourceConnector<unknown>,
  cnbc: cnbcConnector as SourceConnector<unknown>,
};

export function getConnector(sourceType: SourceType): SourceConnector<unknown> | null {
  return REGISTRY[sourceType] ?? null;
}

export function registeredSourceTypes(): SourceType[] {
  return Object.keys(REGISTRY) as SourceType[];
}
