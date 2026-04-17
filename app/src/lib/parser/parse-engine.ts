// Parse engine: orchestrates parsing of captured LinkedIn pages
// Loads HTML from page_cache, determines page type, loads selector config,
// dispatches to the appropriate parser, and returns structured results.

import * as cheerio from 'cheerio';
import { query } from '@/lib/db/client';
import { toSelectorConfig } from '@/types/selector-config';
import type { SelectorConfig, SelectorConfigRow, LinkedInPageType } from '@/types/selector-config';
import { parserRegistry } from './parser-registry';
import { ProfileParser } from './parsers/profile-parser';
import { SearchParser } from './parsers/search-parser';
import { SearchContentParser } from './parsers/search-content-parser';
import { FeedParser } from './parsers/feed-parser';
import { CompanyParser } from './parsers/company-parser';
import { ConnectionsParser } from './parsers/connections-parser';
import { MessagesParser } from './parsers/messages-parser';
import type {
  ParseResult,
  SearchParseData,
  SearchContentParseData,
  ProfileParseData,
} from './types';
import { upsertContactFromProfile, upsertContactsFromSearch } from './contact-upsert';
import { populateUnmatchedDom } from './unmatched-dom';
import { recordParseResult } from './telemetry';
import { wsServer } from '@/lib/websocket/ws-server';
import { createParseCompleteEvent } from '@/lib/websocket/ws-events';

// Register all parsers
parserRegistry.register(new ProfileParser());
parserRegistry.register(new SearchParser());
parserRegistry.register(new SearchContentParser());
parserRegistry.register(new FeedParser());
parserRegistry.register(new CompanyParser());
parserRegistry.register(new ConnectionsParser());
parserRegistry.register(new MessagesParser());

/**
 * Load the active selector config for a given page type from the DB.
 */
async function loadSelectorConfig(
  pageType: LinkedInPageType
): Promise<SelectorConfig | null> {
  const result = await query<SelectorConfigRow>(
    `SELECT id, page_type, selector_name, css_selector, fallback_selectors,
            extraction_method, attribute_name, regex_pattern, is_active,
            version, selectors_json, heuristics, notes, created_by,
            created_at::text, updated_at::text
     FROM selector_configs
     WHERE page_type = $1 AND is_active = true AND selector_name = 'full_config'
     ORDER BY version DESC
     LIMIT 1`,
    [pageType]
  );

  if (result.rows.length === 0) return null;
  return toSelectorConfig(result.rows[0]);
}

/**
 * Parse a cached page by its page_cache ID.
 */
export async function parseCachedPage(cacheId: string): Promise<ParseResult> {
  const startTime = Date.now();

  // Load the cached page
  const cacheResult = await query<{
    id: string;
    url: string;
    page_type: string;
    html_content: string;
    capture_id: string | null;
  }>(
    `SELECT id, url, page_type, html_content, capture_id
     FROM page_cache WHERE id = $1`,
    [cacheId]
  );

  if (cacheResult.rows.length === 0) {
    return {
      success: false,
      pageType: 'OTHER',
      url: '',
      captureId: '',
      fields: [],
      data: null,
      fieldsExtracted: 0,
      fieldsAttempted: 0,
      overallConfidence: 0,
      parseTimeMs: Date.now() - startTime,
      parserVersion: '1.0.0',
      selectorConfigVersion: 0,
      errors: [`Cache entry not found: ${cacheId}`],
    };
  }

  const row = cacheResult.rows[0];
  const pageType = row.page_type as LinkedInPageType;
  const captureId = row.capture_id ?? cacheId;

  // Load selector config
  const config = await loadSelectorConfig(pageType);
  if (!config) {
    return {
      success: false,
      pageType,
      url: row.url,
      captureId,
      fields: [],
      data: null,
      fieldsExtracted: 0,
      fieldsAttempted: 0,
      overallConfidence: 0,
      parseTimeMs: Date.now() - startTime,
      parserVersion: '1.0.0',
      selectorConfigVersion: 0,
      errors: [`No selector config found for page type: ${pageType}`],
    };
  }

  // Get the parser
  const parser = parserRegistry.get(pageType);
  if (!parser) {
    return {
      success: false,
      pageType,
      url: row.url,
      captureId,
      fields: [],
      data: null,
      fieldsExtracted: 0,
      fieldsAttempted: 0,
      overallConfidence: 0,
      parseTimeMs: Date.now() - startTime,
      parserVersion: '1.0.0',
      selectorConfigVersion: config.version,
      errors: [`No parser registered for page type: ${pageType}`],
    };
  }

  // Parse the HTML
  const $ = cheerio.load(row.html_content);
  const result = parser.parse($, config, row.url);

  // Visibility plumbing (WS-2 consumer): record DOM sections that weren't
  // consumed by any primary selector, heuristic, or fallback.
  populateUnmatchedDom($, result);

  const parseTimeMs = Date.now() - startTime;

  // Best-effort telemetry — always flag-gated inside recordParseResult.
  await recordParseResult({ ...result, captureId, parseTimeMs });

  // Mark as parsed in the DB
  await query(
    `UPDATE page_cache
     SET parsed = true, parsed_at = now(), parse_version = $1
     WHERE id = $2`,
    [config.version, cacheId]
  );

  // Upsert contacts from parsed data (fire-and-forget for non-blocking)
  if (result.success && result.data) {
    try {
      if (pageType === 'SEARCH_PEOPLE') {
        const searchData = result.data as SearchParseData;
        if (searchData.results && searchData.results.length > 0) {
          const upsertResult = await upsertContactsFromSearch(searchData.results, row.url);
          // Store import counts in result metadata
          result.errors = result.errors || [];
          if (upsertResult.created > 0 || upsertResult.updated > 0) {
            result.errors.push(
              `Imported: ${upsertResult.created} new, ${upsertResult.updated} updated, ${upsertResult.skipped} skipped`
            );
          }
        }
      } else if (pageType === 'SEARCH_CONTENT') {
        // SEARCH_CONTENT results are posts/articles, not people. Map each
        // result onto the SearchResultEntry shape just enough to upsert the
        // author as a contact (authorName + profile URL). The content body
        // stays out of the contact record; a future track will attach
        // post-level metadata separately.
        const contentData = result.data as SearchContentParseData;
        const authors = contentData.results
          .filter((r) => r.authorName && r.authorProfileUrl)
          .map((r) => ({
            name: r.authorName,
            headline: r.authorHeadline,
            profileUrl: r.authorProfileUrl as string,
            location: null,
            connectionDegree: null,
            mutualConnections: null,
          }));
        if (authors.length > 0) {
          const upsertResult = await upsertContactsFromSearch(authors, row.url);
          result.errors = result.errors || [];
          if (upsertResult.created > 0 || upsertResult.updated > 0) {
            result.errors.push(
              `Imported: ${upsertResult.created} new, ${upsertResult.updated} updated, ${upsertResult.skipped} skipped`
            );
          }
        }
      } else if (pageType === 'PROFILE') {
        const profileData = result.data as ProfileParseData;
        if (profileData.name || profileData.headline) {
          await upsertContactFromProfile(profileData, row.url, result.overallConfidence);
        }
      }
    } catch {
      // Non-critical — don't fail the parse result if upsert fails
    }
  }

  // WS-2 (Phase 2 Track D): push PARSE_COMPLETE to any connected extensions.
  // Always safe; when nothing is listening, this is a no-op. No feature flag —
  // per `08-phased-delivery.md` §4.1, the WS push is always on.
  try {
    if (wsServer.isRunning) {
      wsServer.pushToAll(
        createParseCompleteEvent(
          captureId,
          pageType,
          result.fields
            .filter((f) => f.value !== null && f.value !== '' && f.value !== undefined)
            .map((f) => ({ field: f.field, confidence: f.confidence }))
        )
      );
    }
  } catch {
    // Never fail a parse over a broadcast hiccup.
  }

  return {
    ...result,
    captureId,
    parseTimeMs,
  };
}

/**
 * Parse raw HTML directly (without loading from cache).
 */
export function parseHtml(
  html: string,
  pageType: LinkedInPageType,
  config: SelectorConfig,
  url: string,
  captureId: string
): ParseResult {
  const startTime = Date.now();

  const parser = parserRegistry.get(pageType);
  if (!parser) {
    return {
      success: false,
      pageType,
      url,
      captureId,
      fields: [],
      data: null,
      fieldsExtracted: 0,
      fieldsAttempted: 0,
      overallConfidence: 0,
      parseTimeMs: Date.now() - startTime,
      parserVersion: '1.0.0',
      selectorConfigVersion: config.version,
      errors: [`No parser registered for page type: ${pageType}`],
      unmatched: [],
    };
  }

  const $ = cheerio.load(html);
  const result = parser.parse($, config, url);

  populateUnmatchedDom($, result);

  return {
    ...result,
    captureId,
    parseTimeMs: Date.now() - startTime,
  };
}
