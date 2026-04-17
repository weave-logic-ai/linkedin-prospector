// Parser fallback registry
// Per `01-parser-audit.md` §4.3: fallbacks run after primary selectors +
// heuristics and provide recovery paths when LinkedIn's hashed class names
// defeat the primary chain. Each strategy is a pure function — given a
// CheerioAPI and a URL, return a partial list of `ExtractedField`s
// marked with `source: 'fallback'` and `selectorUsed: 'fallback:<name>'`.
//
// Parsers call `runFallbacks(pageType, $, url, alreadyExtracted)` which
// returns only the fields the primary path did NOT already populate.

import type { CheerioAPI } from 'cheerio';
import type { LinkedInPageType } from '@/types/selector-config';
import type { ExtractedField } from '../types';

export interface FallbackStrategy {
  /** Short identifier, used as `selectorUsed = fallback:<name>` in telemetry. */
  readonly name: string;
  /** Page types this strategy applies to. */
  readonly pageTypes: ReadonlyArray<LinkedInPageType>;
  /**
   * Run the strategy. Receives the parsed document plus the set of field
   * names that already have non-null values (so strategies can short-circuit
   * when there is nothing left to contribute). Return an array of partial
   * fields keyed by canonical field name.
   */
  apply(
    $: CheerioAPI,
    url: string,
    alreadyFilled: ReadonlySet<string>
  ): ExtractedField[];
}

const REGISTRY: Map<LinkedInPageType, FallbackStrategy[]> = new Map();

/** Register a fallback. Idempotent on (pageType, name) pair. */
export function registerFallback(strategy: FallbackStrategy): void {
  for (const pt of strategy.pageTypes) {
    const list = REGISTRY.get(pt) ?? [];
    if (!list.some((s) => s.name === strategy.name)) {
      list.push(strategy);
      REGISTRY.set(pt, list);
    }
  }
}

/** Registered strategies for a given page type, in registration order. */
export function getFallbacks(
  pageType: LinkedInPageType
): ReadonlyArray<FallbackStrategy> {
  return REGISTRY.get(pageType) ?? [];
}

/** Full registry dump — used by tests + admin surface. */
export function listAllFallbacks(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [pt, list] of REGISTRY.entries()) {
    out[pt] = list.map((s) => s.name);
  }
  return out;
}

/**
 * Execute every fallback registered for `pageType`. Only fields whose
 * canonical name is NOT in `alreadyFilled` propagate — primary hits win.
 * Returns a flat list of extracted fields tagged `source: 'fallback'`.
 */
export function runFallbacks(
  pageType: LinkedInPageType,
  $: CheerioAPI,
  url: string,
  alreadyFilled: ReadonlySet<string>
): ExtractedField[] {
  const strategies = getFallbacks(pageType);
  if (strategies.length === 0) return [];

  const out: ExtractedField[] = [];
  const filled = new Set(alreadyFilled);

  for (const strategy of strategies) {
    let produced: ExtractedField[];
    try {
      produced = strategy.apply($, url, filled);
    } catch {
      // A broken fallback must never break a parse.
      continue;
    }
    for (const f of produced) {
      if (f.value === null || f.value === undefined) continue;
      if (filled.has(f.field)) continue;
      out.push({
        ...f,
        source: 'fallback',
        selectorUsed: f.selectorUsed || `fallback:${strategy.name}`,
      });
      filled.add(f.field);
    }
  }
  return out;
}

/** Test-only helper — clears the registry between test cases. */
export function _clearFallbackRegistryForTests(): void {
  REGISTRY.clear();
}
