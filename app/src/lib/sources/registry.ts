// Source connector registry.
//
// Phase 2 Track E ships Wayback + EDGAR. Phase 3 Track F adds the RSS family
// (core RSS, Google News fallback, corporate blog discovery). Later tracks
// extend this map additively (podcast, targeted per-site news scrapers).

import type { SourceConnector, SourceType } from './types';
import { waybackConnector } from './connectors/wayback';
import { edgarConnector } from './connectors/edgar';
import { rssConnector } from './connectors/rss';
import { googleNewsConnector } from './connectors/google-news';
import { corporateBlogConnector } from './connectors/corporate-blog';

const REGISTRY: Partial<Record<SourceType, SourceConnector<unknown>>> = {
  wayback: waybackConnector as SourceConnector<unknown>,
  edgar: edgarConnector as SourceConnector<unknown>,
  rss: rssConnector as SourceConnector<unknown>,
  // Google News lives under the 'news' source_type per §7.2.
  news: googleNewsConnector as SourceConnector<unknown>,
  blog: corporateBlogConnector as SourceConnector<unknown>,
};

export function getConnector(sourceType: SourceType): SourceConnector<unknown> | null {
  return REGISTRY[sourceType] ?? null;
}

export function registeredSourceTypes(): SourceType[] {
  return Object.keys(REGISTRY) as SourceType[];
}
