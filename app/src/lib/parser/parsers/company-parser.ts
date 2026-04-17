// Company page parser
// Extracts company name, industry, size, about, etc.

import type { CheerioAPI } from 'cheerio';
import type { SelectorConfig } from '@/types/selector-config';
import type {
  PageParser,
  ParseResult,
  CompanyParseData,
  ExtractedField,
} from '../types';
import { extractField } from '../selector-extractor';
import { runFallbacks } from '../fallbacks/registry';
import '../fallbacks/strategies';

export class CompanyParser implements PageParser {
  readonly pageType = 'COMPANY' as const;
  readonly version = '1.0.0';

  parse(
    $: CheerioAPI,
    config: SelectorConfig,
    url: string
  ): Omit<ParseResult, 'captureId' | 'parseTimeMs'> {
    const fields: ExtractedField[] = [];
    const errors: string[] = [];
    const selectors = config.selectors;

    // Extract all company fields
    const fieldNames = [
      'companyName',
      'industry',
      'companySize',
      'headquarters',
      'about',
      'website',
      'followerCount',
      'specialties',
      'founded',
      'employeesOnLinkedIn',
    ];

    for (const fieldName of fieldNames) {
      const chain = selectors[fieldName];
      if (chain) {
        fields.push(extractField($, chain, fieldName));
      }
    }

    // Fallback registry — recovers from hashed-class churn via og-meta + title-tag.
    const filled = new Set<string>(
      fields.filter((f) => f.value !== null && f.value !== '').map((f) => f.field)
    );
    const fallbackFields = runFallbacks('COMPANY', $, url, filled);
    fields.push(...fallbackFields);

    const getValue = (fieldName: string): string | null => {
      const field = fields.find((f) => f.field === fieldName);
      if (!field || field.value === null) return null;
      return typeof field.value === 'string' ? field.value : null;
    };

    const getNumValue = (fieldName: string): number | null => {
      const field = fields.find((f) => f.field === fieldName);
      if (!field || field.value === null) return null;
      if (typeof field.value === 'number') return field.value;
      if (typeof field.value === 'string') {
        const n = parseInt(field.value.replace(/[,\s]/g, ''), 10);
        return isNaN(n) ? null : n;
      }
      return null;
    };

    const getArrayValue = (fieldName: string): string[] => {
      const field = fields.find((f) => f.field === fieldName);
      if (!field || field.value === null) return [];
      if (Array.isArray(field.value)) return field.value;
      if (typeof field.value === 'string') {
        return field.value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }
      return [];
    };

    // `founded` is a year string like "1947". Keep as string to match the
    // `CompanyParseData.founded: string | null` contract; tolerate noisy text
    // by extracting the first 4-digit year when present.
    const foundedRaw = getValue('founded');
    let founded: string | null = foundedRaw;
    if (foundedRaw) {
      const yearMatch = foundedRaw.match(/\b(1[89]\d{2}|20\d{2}|21\d{2})\b/);
      if (yearMatch) founded = yearMatch[1];
    }

    // `employeesOnLinkedIn` is rendered as a members-count anchor, e.g.
    // "5,232 associated members on LinkedIn". Prefer parsing the integer
    // prefix off the selector hit; otherwise leave null.
    let employeesOnLinkedIn: number | null = null;
    const employeesField = fields.find((f) => f.field === 'employeesOnLinkedIn');
    if (employeesField && employeesField.value !== null) {
      const raw =
        typeof employeesField.value === 'string'
          ? employeesField.value
          : typeof employeesField.value === 'number'
            ? String(employeesField.value)
            : null;
      if (raw) {
        const m = raw.match(/([\d,]+)/);
        if (m) {
          const n = parseInt(m[1].replace(/,/g, ''), 10);
          if (!isNaN(n)) employeesOnLinkedIn = n;
        }
      }
    }

    const data: CompanyParseData = {
      name: getValue('companyName'),
      industry: getValue('industry'),
      companySize: getValue('companySize'),
      headquarters: getValue('headquarters'),
      founded,
      specialties: getArrayValue('specialties'),
      about: getValue('about'),
      website: getValue('website'),
      followerCount: getNumValue('followerCount'),
      employeesOnLinkedIn,
    };

    const fieldsExtracted = fields.filter(
      (f) => f.value !== null && f.confidence > 0
    ).length;
    const fieldsAttempted = fields.length;
    const confidences = fields
      .filter((f) => f.confidence > 0)
      .map((f) => f.confidence);
    const overallConfidence =
      confidences.length > 0
        ? confidences.reduce((a, b) => a + b, 0) / confidences.length
        : 0;

    return {
      success: fieldsExtracted > 0,
      pageType: 'COMPANY',
      url,
      fields,
      data,
      fieldsExtracted,
      fieldsAttempted,
      overallConfidence: Math.round(overallConfidence * 100) / 100,
      parserVersion: this.version,
      selectorConfigVersion: config.version,
      errors,
    };
  }
}
