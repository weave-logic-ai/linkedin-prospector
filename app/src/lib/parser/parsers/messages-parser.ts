// Messages page parser
// Extracts conversation list from LinkedIn messages

import type { CheerioAPI } from 'cheerio';
import type { SelectorConfig } from '@/types/selector-config';
import type {
  PageParser,
  ParseResult,
  MessagesParseData,
  ConversationEntry,
  ExtractedField,
} from '../types';
import { runFallbacks } from '../fallbacks/registry';
import '../fallbacks/strategies';

export class MessagesParser implements PageParser {
  readonly pageType = 'MESSAGES' as const;
  readonly version = '1.0.0';

  parse(
    $: CheerioAPI,
    config: SelectorConfig,
    url: string
  ): Omit<ParseResult, 'captureId' | 'parseTimeMs'> {
    const fields: ExtractedField[] = [];
    const errors: string[] = [];
    const selectors = config.selectors;

    const conversations: ConversationEntry[] = [];
    const itemChain = selectors['conversationItem'];

    if (itemChain) {
      const elements = $(itemChain.selectors[0]);

      elements.each((_idx, el) => {
        const $el = $(el);

        let participantName = '';
        const nameChain = selectors['participantName'];
        if (nameChain) {
          for (const sel of nameChain.selectors) {
            const text = $el.find(sel).first().text().trim();
            if (text) {
              participantName = text;
              break;
            }
          }
        }
        if (!participantName) return;

        let lastMessagePreview: string | null = null;
        const msgChain = selectors['lastMessage'];
        if (msgChain) {
          for (const sel of msgChain.selectors) {
            const text = $el.find(sel).first().text().trim();
            if (text) {
              lastMessagePreview = text;
              break;
            }
          }
        }

        let timestamp: string | null = null;
        const timeChain = selectors['timestamp'];
        if (timeChain) {
          for (const sel of timeChain.selectors) {
            const text = $el.find(sel).first().text().trim();
            if (text) {
              timestamp = text;
              break;
            }
          }
        }

        let unread = false;
        const unreadChain = selectors['unreadIndicator'];
        if (unreadChain) {
          for (const sel of unreadChain.selectors) {
            const found = $el.find(sel).length > 0;
            if (found) {
              unread = true;
              break;
            }
          }
        }

        conversations.push({
          participantName,
          participantProfileUrl: null,
          lastMessagePreview,
          timestamp,
          unread,
        });
      });
    }

    // Fallback: use href-pattern to populate participantProfileUrl where the
    // selector chain left it null. The registry strategy returns a list of
    // /in/ URLs; we fold them into conversations in order.
    const primaryHit = conversations.length > 0;
    const registryHits = runFallbacks('MESSAGES', $, url, new Set<string>());
    fields.push(...registryHits);
    const urlsField = registryHits.find((f) => f.field === 'participantProfileUrls');
    if (urlsField && Array.isArray(urlsField.value)) {
      const urls = urlsField.value as string[];
      for (let i = 0; i < conversations.length && i < urls.length; i++) {
        if (!conversations[i].participantProfileUrl) {
          conversations[i].participantProfileUrl = urls[i];
        }
      }
    }

    const data: MessagesParseData = { conversations };

    fields.push({
      field: 'conversations',
      value: conversations.map((c) => c.participantName),
      confidence: conversations.length > 0 ? 0.75 : 0,
      selectorUsed: primaryHit ? (itemChain?.selectors[0] ?? '') : '',
      selectorIndex: 0,
      source: 'selector',
    });

    return {
      success: conversations.length > 0,
      pageType: 'MESSAGES',
      url,
      fields,
      data,
      fieldsExtracted: conversations.length > 0 ? 1 : 0,
      fieldsAttempted: 1,
      overallConfidence: conversations.length > 0 ? 0.75 : 0,
      parserVersion: this.version,
      selectorConfigVersion: config.version,
      errors,
    };
  }
}
