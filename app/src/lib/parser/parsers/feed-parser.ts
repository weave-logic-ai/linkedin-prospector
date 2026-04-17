// Feed page parser
// Extracts posts from the LinkedIn feed

import type { CheerioAPI } from 'cheerio';
import type { SelectorConfig } from '@/types/selector-config';
import type {
  PageParser,
  ParseResult,
  FeedParseData,
  FeedPostEntry,
  ExtractedField,
} from '../types';
import { runFallbacks } from '../fallbacks/registry';
import '../fallbacks/strategies';

export class FeedParser implements PageParser {
  readonly pageType = 'FEED' as const;
  readonly version = '1.0.0';

  parse(
    $: CheerioAPI,
    config: SelectorConfig,
    url: string
  ): Omit<ParseResult, 'captureId' | 'parseTimeMs'> {
    const fields: ExtractedField[] = [];
    const errors: string[] = [];
    const selectors = config.selectors;

    const posts: FeedPostEntry[] = [];
    const postItemChain = selectors['postItem'];

    if (postItemChain) {
      const postElements = $(postItemChain.selectors[0]);

      postElements.each((_idx, el) => {
        const $el = $(el);

        // Author name
        let authorName = '';
        const nameChain = selectors['authorName'];
        if (nameChain) {
          for (const sel of nameChain.selectors) {
            const text = $el.find(sel).first().text().trim();
            if (text) {
              authorName = text;
              break;
            }
          }
        }
        if (!authorName) return;

        // Author headline
        let authorHeadline: string | null = null;
        const headlineChain = selectors['authorHeadline'];
        if (headlineChain) {
          for (const sel of headlineChain.selectors) {
            const text = $el.find(sel).first().text().trim();
            if (text) {
              authorHeadline = text;
              break;
            }
          }
        }

        // Post content
        let content = '';
        const contentChain = selectors['postContent'];
        if (contentChain) {
          for (const sel of contentChain.selectors) {
            const text = $el.find(sel).first().text().trim();
            if (text) {
              content = text;
              break;
            }
          }
        }

        // Like count
        let likes: number | null = null;
        const likeChain = selectors['likeCount'];
        if (likeChain) {
          for (const sel of likeChain.selectors) {
            const text = $el.find(sel).first().text().trim();
            if (text) {
              const num = parseInt(text.replace(/[,\s]/g, ''), 10);
              if (!isNaN(num)) {
                likes = num;
                break;
              }
            }
          }
        }

        // Comment count
        let comments: number | null = null;
        const commentChain = selectors['commentCount'];
        if (commentChain) {
          for (const sel of commentChain.selectors) {
            const text = $el.find(sel).first().text().trim();
            if (text) {
              const num = parseInt(text.replace(/[,\s]/g, ''), 10);
              if (!isNaN(num)) {
                comments = num;
                break;
              }
            }
          }
        }

        // Repost count — only emitted when there are any, per §5.6. The
        // selector defaults are kept inline so the offline fixture config
        // does not need to ship the chain.
        let reposts: number | null = null;
        const repostSelectors =
          selectors['repostCount']?.selectors ?? [
            '.social-details-social-counts__reposts',
            '.social-details-social-counts__item--right-aligned',
          ];
        for (const sel of repostSelectors) {
          const text = $el.find(sel).first().text().trim();
          if (!text) continue;
          const num = parseInt(text.replace(/[,\s]/g, ''), 10);
          if (!isNaN(num)) {
            reposts = num;
            break;
          }
        }

        // postedTimeAgo — visible "2h", "3d", "1mo" style string under the
        // actor subdescription. Accept any relative-time-looking shape.
        let postedTimeAgo: string | null = null;
        const timeSelectors =
          selectors['postedTimeAgo']?.selectors ?? [
            '.feed-shared-actor__sub-description',
            '.update-components-actor__sub-description',
            'time',
          ];
        for (const sel of timeSelectors) {
          const text = $el.find(sel).first().text().trim();
          if (!text) continue;
          // Keep the first line; LinkedIn sometimes appends " • Edited" etc.
          const firstLine = text.split(/\s*[•\n]\s*/)[0].trim();
          if (/\d+\s*(s|m|h|d|w|mo|y|yr)\b/i.test(firstLine) || /\b(Just now|Yesterday|Today)\b/i.test(firstLine)) {
            postedTimeAgo = firstLine;
            break;
          }
        }

        // postType classifier — cheapest wins first. Order matters:
        // repost > poll > article > original. `unknown` only when the shell
        // is present but nothing identifying is inside (defensive).
        let postType: FeedPostEntry['postType'] = 'original';
        if ($el.find('.update-v2-social-activity__reshared-by').length > 0) {
          postType = 'repost';
        } else if ($el.find('.feed-shared-poll, .feed-shared-poll__question').length > 0) {
          postType = 'poll';
        } else if ($el.find('.feed-shared-article, .feed-shared-article__title').length > 0) {
          postType = 'article';
        } else if ($el.find('.feed-shared-event, .feed-shared-event__title').length > 0) {
          postType = 'event';
        }

        posts.push({
          authorName,
          authorHeadline,
          authorProfileUrl: null,
          content,
          postUrl: null,
          likes,
          comments,
          reposts,
          postedTimeAgo,
          postType,
        });
      });
    }

    // Fallback registry: data-urn is the most stable feed anchor. We use it
    // to back-fill authorProfileUrl where the selector chain left it null.
    const registryHits = runFallbacks('FEED', $, url, new Set<string>());
    fields.push(...registryHits);
    const authorsField = registryHits.find((f) => f.field === 'postAuthorHrefs');
    if (authorsField && typeof authorsField.value === 'string') {
      try {
        const authors = JSON.parse(authorsField.value) as Array<{
          urn: string;
          url: string | null;
          name: string | null;
        }>;
        for (let i = 0; i < posts.length && i < authors.length; i++) {
          if (!posts[i].authorProfileUrl && authors[i].url) {
            posts[i].authorProfileUrl = authors[i].url;
          }
          if (!posts[i].postUrl && authors[i].urn) {
            posts[i].postUrl = `https://www.linkedin.com/feed/update/${authors[i].urn}/`;
          }
        }
      } catch {
        // Ignore — fallback is best-effort.
      }
    }

    const data: FeedParseData = { posts };

    fields.push({
      field: 'posts',
      value: posts.map((p) => p.authorName),
      confidence: posts.length > 0 ? 0.75 : 0,
      selectorUsed: postItemChain?.selectors[0] ?? '',
      selectorIndex: 0,
      source: 'selector',
    });

    return {
      success: posts.length > 0,
      pageType: 'FEED',
      url,
      fields,
      data,
      fieldsExtracted: posts.length > 0 ? 1 : 0,
      fieldsAttempted: 1,
      overallConfidence: posts.length > 0 ? 0.75 : 0,
      parserVersion: this.version,
      selectorConfigVersion: config.version,
      errors,
    };
  }
}
