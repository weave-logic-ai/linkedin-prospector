// Content-search page parser (Phase 1.5).
//
// SEARCH_CONTENT was a 0% yield page type at the Track A baseline — the
// fixtures ship the expected shape but no parser was registered. This parser
// is a thin wrapper that:
//
//  1. Uses the search-parser's result-container selector chain for the
//     envelope — `li.reusable-search__result-container` inside
//     `.search-results-container` per the current offline configs.
//  2. Reuses the feed-parser's post-extraction logic (author link, content
//     span, like/comment counts) for each container — content search reuses
//     the feed post DOM shell, with or without a wrapping `<article>` for
//     long-form content.
//  3. Adds a small article classifier so `postType` and `title` populate
//     when the container wraps `.feed-shared-article` (and therefore has an
//     `<h3 class="feed-shared-article__title">`).
//
// The envelope-level `totalResultsEstimate` reuses the SEARCH_PEOPLE path
// (regex over the page-title string + URL `?page=` query-string).

import type { CheerioAPI, Cheerio } from 'cheerio';
import type { AnyNode, Element } from 'domhandler';
import type { SelectorConfig } from '@/types/selector-config';
import type {
  PageParser,
  ParseResult,
  SearchContentParseData,
  SearchContentResultEntry,
  ExtractedField,
} from '../types';
import { extractField } from '../selector-extractor';
import { runFallbacks } from '../fallbacks/registry';
import '../fallbacks/strategies';

const DEFAULT_RESULT_SELECTORS = [
  '.reusable-search__result-container',
  'li.reusable-search__result-container',
  '.search-results-container li',
];

const DEFAULT_AUTHOR_LINK_SELECTORS = [
  'a.feed-shared-actor__container-link',
  'a[href*="/in/"]',
];

const DEFAULT_AUTHOR_NAME_SELECTORS = [
  '.feed-shared-actor__name',
  '.feed-shared-actor__name span',
];

const DEFAULT_AUTHOR_HEADLINE_SELECTORS = ['.feed-shared-actor__description'];

const DEFAULT_CONTENT_SELECTORS = [
  '.feed-shared-update-v2__description span',
  '.feed-shared-update-v2__description',
  '.feed-shared-article__subtitle',
];

const DEFAULT_TITLE_SELECTORS = [
  '.feed-shared-article__title',
  'h3.feed-shared-article__title',
];

const DEFAULT_LIKE_SELECTORS = [
  '.social-details-social-counts__reactions-count',
  '.social-details-social-counts span',
];

const DEFAULT_COMMENT_SELECTORS = [
  '.social-details-social-counts__comments',
  '.social-details-social-counts span',
];

function firstNonEmpty(
  $el: Cheerio<AnyNode>,
  selectors: string[]
): string {
  for (const sel of selectors) {
    const text = $el.find(sel).first().text().trim();
    if (text) return text;
  }
  return '';
}

function firstIntMatch(
  $: CheerioAPI,
  $el: Cheerio<AnyNode>,
  selectors: string[],
  keyword: RegExp | null
): number | null {
  for (const sel of selectors) {
    const matches = $el.find(sel);
    let found: number | null = null;
    matches.each((_idx, node) => {
      if (found !== null) return;
      const candidate = $(node as Element).text().trim();
      if (!candidate) return;
      if (keyword && !keyword.test(candidate)) return;
      const m = candidate.match(/([\d,]+)/);
      if (!m) return;
      const n = parseInt(m[1].replace(/,/g, ''), 10);
      if (!isNaN(n)) found = n;
    });
    if (found !== null) return found;
  }
  return null;
}

function absolutizeProfileHref(href: string): string {
  const stripped = href.split('?')[0];
  return stripped.startsWith('http')
    ? stripped
    : `https://www.linkedin.com${stripped}`;
}

export class SearchContentParser implements PageParser {
  readonly pageType = 'SEARCH_CONTENT' as const;
  readonly version = '1.0.0';

  parse(
    $: CheerioAPI,
    config: SelectorConfig,
    url: string
  ): Omit<ParseResult, 'captureId' | 'parseTimeMs'> {
    const fields: ExtractedField[] = [];
    const errors: string[] = [];
    const selectors = config.selectors;

    // Result envelope — prefer config-provided selectors, fall back to the
    // stable content-search shape.
    const envelopeSelectors =
      selectors['resultItem']?.selectors ?? DEFAULT_RESULT_SELECTORS;

    let resultElements: Cheerio<AnyNode> | null = null;
    let envelopeUsed = '';
    for (const sel of envelopeSelectors) {
      const matched = $(sel);
      if (matched.length > 0) {
        resultElements = matched;
        envelopeUsed = sel;
        break;
      }
    }

    const results: SearchContentResultEntry[] = [];

    if (resultElements) {
      resultElements.each((_idx, el) => {
        const $el = $(el);

        // Author link — href + text. Mirrors feed-parser's fallback.
        let authorProfileUrl: string | null = null;
        let authorNameFromLink: string | null = null;
        for (const sel of DEFAULT_AUTHOR_LINK_SELECTORS) {
          const $a = $el.find(sel).first();
          if (!$a.length) continue;
          const href = $a.attr('href') ?? '';
          if (href.includes('/in/')) {
            authorProfileUrl = absolutizeProfileHref(href);
            const linkText = $a.text().trim();
            if (linkText && linkText.length >= 2 && linkText.length < 160) {
              authorNameFromLink = linkText.split('\n')[0].trim();
            }
            break;
          }
        }

        const nameFromSelector = firstNonEmpty($el, DEFAULT_AUTHOR_NAME_SELECTORS);
        const authorName = nameFromSelector || authorNameFromLink || '';
        if (!authorName) return;

        const authorHeadline =
          firstNonEmpty($el, DEFAULT_AUTHOR_HEADLINE_SELECTORS) || null;

        // Title — when the container wraps a `<article class="feed-shared-article">`.
        let title: string | null = null;
        const titleText = firstNonEmpty($el, DEFAULT_TITLE_SELECTORS);
        if (titleText) title = titleText;

        // Content — for article cards, the subtitle stands in for content;
        // for regular posts, `.feed-shared-update-v2__description span`.
        let content = firstNonEmpty($el, DEFAULT_CONTENT_SELECTORS);
        if (!content && title) {
          // Fall back to the title so downstream "empty content" heuristics
          // still see something searchable.
          content = title;
        }

        // Engagement counts. LinkedIn's search envelope often renders these
        // inline as "42 likes" / "7 comments" rather than the feed-style
        // split spans; accept either.
        let likes = firstIntMatch(
          $,
          $el,
          DEFAULT_LIKE_SELECTORS,
          /(like|reaction)/i
        );
        if (likes === null) {
          // Fall back to the first numeric value inside .social-details.
          const raw = $el.find('.social-details-social-counts').first().text();
          const m = raw.match(/([\d,]+)/);
          if (m) {
            const n = parseInt(m[1].replace(/,/g, ''), 10);
            if (!isNaN(n)) likes = n;
          }
        }

        const comments = firstIntMatch(
          $,
          $el,
          DEFAULT_COMMENT_SELECTORS,
          /comment/i
        );

        // data-urn anchored classification: article vs post vs video.
        // `urn:li:article:` for long-form, `urn:li:activity:` for everything
        // else. Video is heuristic-only — LinkedIn marks video posts with
        // `.feed-shared-linkedin-video` when present, but the fixture keeps
        // them as plain activity updates, so we treat them as 'post' and
        // let callers promote to 'video' via future fallback work.
        let postType: SearchContentResultEntry['postType'] = 'unknown';
        const urn =
          $el.find('[data-urn]').first().attr('data-urn') ??
          $el.attr('data-urn') ??
          '';
        if (urn.startsWith('urn:li:article')) {
          postType = 'article';
        } else if (
          $el.find('article.feed-shared-article, .feed-shared-article__title').length > 0
        ) {
          postType = 'article';
        } else if (urn.startsWith('urn:li:activity')) {
          postType = 'post';
        }

        // postUrl — reuse the URN when present.
        const postUrl = urn ? `https://www.linkedin.com/feed/update/${urn}/` : null;

        results.push({
          authorName,
          authorHeadline,
          authorProfileUrl,
          content,
          title,
          postUrl,
          likes,
          comments,
          postType,
        });
      });
    }

    // totalResultsEstimate — reuse SEARCH_PEOPLE's chain.
    const totalField = extractField(
      $,
      selectors['totalResults'] ?? {
        name: 'Total Results',
        selectors: ['.search-results-page-title'],
        transform: 'trim',
      },
      'totalResults'
    );
    fields.push(totalField);

    let totalResultsEstimate: number | null = null;
    if (totalField.value && typeof totalField.value === 'string') {
      const match = totalField.value.match(/([\d,]+)/);
      if (match) totalResultsEstimate = parseInt(match[1].replace(/,/g, ''), 10);
    }
    if (totalResultsEstimate === null) {
      const bodyText = $('body').text();
      const bm = bodyText.match(/About\s+([\d,]+)\s+results/i) ?? bodyText.match(/([\d,]+)\s+results/i);
      if (bm) {
        const n = parseInt(bm[1].replace(/,/g, ''), 10);
        if (!isNaN(n)) totalResultsEstimate = n;
      }
    }

    let currentPage: number | null = null;
    try {
      const urlObj = new URL(url);
      const page = urlObj.searchParams.get('page');
      if (page) currentPage = parseInt(page, 10);
    } catch {
      // Ignore invalid URLs — parse can still succeed.
    }

    const data: SearchContentParseData = {
      results,
      totalResultsEstimate,
      currentPage: currentPage ?? 1,
    };

    fields.push({
      field: 'results',
      value: results.map((r) => r.authorName),
      confidence: results.length > 0 ? 0.75 : 0,
      selectorUsed: envelopeUsed || (envelopeSelectors[0] ?? ''),
      selectorIndex: 0,
      source: 'selector',
    });

    if (totalResultsEstimate !== null) {
      fields.push({
        field: 'totalResultsEstimate',
        value: totalResultsEstimate,
        confidence: 0.7,
        selectorUsed: 'search-results-page-title',
        selectorIndex: 0,
        source: 'selector',
      });
    }

    // Registry-driven fallback: surfaces data-urn content ids for telemetry
    // parity with FEED. Does not back-fill result fields directly (none of
    // the SEARCH_CONTENT expected fields map cleanly onto a URN list) but
    // gives the audit surface something to show.
    const filled = new Set<string>(
      fields.filter((f) => f.value !== null && f.value !== '').map((f) => f.field)
    );
    const registryHits = runFallbacks('SEARCH_CONTENT', $, url, filled);
    fields.push(...registryHits);

    return {
      success: results.length > 0,
      pageType: 'SEARCH_CONTENT',
      url,
      fields,
      data,
      fieldsExtracted: results.length > 0 ? 1 : 0,
      fieldsAttempted: 1,
      overallConfidence: results.length > 0 ? 0.75 : 0,
      parserVersion: this.version,
      selectorConfigVersion: config.version,
      errors,
    };
  }
}
