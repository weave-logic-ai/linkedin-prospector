// Source connector registry.
//
// Phase 2 Track E ships Wayback + EDGAR. Phase 3 adds RSS / news / blog /
// podcast — those connectors register here in follow-up PRs.

import type { SourceConnector, SourceType } from './types';
import { waybackConnector } from './connectors/wayback';
import { edgarConnector } from './connectors/edgar';

const REGISTRY: Partial<Record<SourceType, SourceConnector<unknown>>> = {
  wayback: waybackConnector as SourceConnector<unknown>,
  edgar: edgarConnector as SourceConnector<unknown>,
};

export function getConnector(sourceType: SourceType): SourceConnector<unknown> | null {
  return REGISTRY[sourceType] ?? null;
}

export function registeredSourceTypes(): SourceType[] {
  return Object.keys(REGISTRY) as SourceType[];
}
