// WS-3 Phase 6 polish — snippet PII scrubber.
//
// Before a snippet is persisted, we run a cheap regex pass looking for the
// four "obvious PII" shapes that Phase 6 §9 calls out: emails, phone numbers,
// US SSN-shaped strings, and credit-card-shaped strings. Any hit causes the
// matched substring to be replaced with a bracketed placeholder and the
// `piiScrubbed` flag to flip on.
//
// Regex sets are lifted from `scripts/redaction.ts` (already in the repo —
// that module is the source of truth for LinkedIn fixture redaction) with the
// tightening noted below:
//   - email / phone patterns reused verbatim
//   - SSN + credit-card patterns added here because `scripts/redaction.ts`
//     targets HTML fixtures (not user-entered text) and doesn't carry them.
//
// Important: this is *not* an LLM call. Per the hard constraints in the
// sprint brief we stay regex-only. That means false positives are possible
// (e.g. an ISBN-shaped string that looks like a credit card) — the tradeoff
// is intentional because any false positive still produces a saveable
// snippet, just one with scrubbed placeholders where the match was.

export interface PiiDetectionResult {
  /** The (possibly-scrubbed) text. When `hit === false` equal to the input. */
  scrubbedText: string;
  /** True when at least one PII regex matched. */
  hit: boolean;
  /** Per-pattern hit counts. Empty object on `hit === false`. */
  hits: Record<PiiKind, number>;
  /** Ordered list of detections (first-to-last in input). */
  detections: Array<{ kind: PiiKind; match: string; placeholder: string }>;
}

export type PiiKind = 'email' | 'phone' | 'ssn' | 'credit-card';

const PLACEHOLDER: Record<PiiKind, string> = {
  email: '[email]',
  phone: '[phone]',
  ssn: '[ssn]',
  'credit-card': '[credit-card]',
};

// Order matters — credit-card / ssn are the most specific; run first so the
// phone regex doesn't also claim a 16-digit credit-card number.
const PATTERNS: Array<{ kind: PiiKind; regex: RegExp }> = [
  // Credit cards: 13-19 digits, optionally separated by spaces or dashes.
  // Anchored to word boundaries so phone numbers (with shorter digit runs) are
  // not swallowed. We apply a Luhn check after the shape match to reduce
  // false positives on sequences like "1234 5678 9012 3456".
  {
    kind: 'credit-card',
    regex: /(?<![\w-])(?:\d[ -]?){12,18}\d(?![\w-])/g,
  },
  // US SSN shape — three digits, two digits, four digits, separated by `-`
  // or spaces. We deliberately do not try to validate area/group numbers.
  {
    kind: 'ssn',
    regex: /(?<![\w-])\d{3}[- ]?\d{2}[- ]?\d{4}(?![\w-])/g,
  },
  // Email — mirrors `scripts/redaction.ts` rule 7.
  {
    kind: 'email',
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  },
  // Phone — mirrors `scripts/redaction.ts` rule 8, tightened with a minimum
  // total digit count so we don't flag short numeric strings (e.g. "2024"
  // in the middle of a sentence).
  {
    kind: 'phone',
    regex:
      /(?<![\w-])(?:\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}(?![\w-])/g,
  },
];

function luhnOk(raw: string): boolean {
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (shouldDouble) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

/**
 * Detect + scrub PII in a user-entered snippet text.
 *
 * Behaviour contract (exercised by `tests/snippets/pii-scrubber.test.ts`):
 *   - No PII → returns the input unchanged, `hit === false`.
 *   - Any PII → returns the input with matches replaced by `[email]`,
 *     `[phone]`, `[ssn]`, `[credit-card]`; `hit === true`.
 *   - Multiple kinds can hit in one pass; the `detections[]` array preserves
 *     discovery order per-kind; `hits` counts per kind.
 *   - Credit-card shape matches only when the Luhn check passes — any 16-digit
 *     random blob will be mis-flagged otherwise.
 */
export function detectAndScrubPii(input: string): PiiDetectionResult {
  if (!input || typeof input !== 'string') {
    return {
      scrubbedText: input ?? '',
      hit: false,
      hits: { email: 0, phone: 0, ssn: 0, 'credit-card': 0 },
      detections: [],
    };
  }

  let working = input;
  const hits: Record<PiiKind, number> = {
    email: 0,
    phone: 0,
    ssn: 0,
    'credit-card': 0,
  };
  const detections: PiiDetectionResult['detections'] = [];

  for (const { kind, regex } of PATTERNS) {
    regex.lastIndex = 0;
    working = working.replace(regex, (match) => {
      if (kind === 'credit-card' && !luhnOk(match)) {
        return match; // shape matched but Luhn failed — leave as-is.
      }
      hits[kind] += 1;
      detections.push({ kind, match, placeholder: PLACEHOLDER[kind] });
      return PLACEHOLDER[kind];
    });
  }

  const hit = detections.length > 0;
  return { scrubbedText: working, hit, hits, detections };
}

/**
 * Browser-facing helper: produce a UI-friendly summary describing what would
 * be redacted if the user clicks Save. Returns `null` when nothing was found
 * so callers can skip rendering the warning banner.
 */
export function summarizePiiDetection(
  result: PiiDetectionResult
): string | null {
  if (!result.hit) return null;
  const parts: string[] = [];
  if (result.hits.email > 0) parts.push(`${result.hits.email} email`);
  if (result.hits.phone > 0) parts.push(`${result.hits.phone} phone`);
  if (result.hits.ssn > 0) parts.push(`${result.hits.ssn} SSN`);
  if (result.hits['credit-card'] > 0)
    parts.push(`${result.hits['credit-card']} credit-card`);
  return parts.join(', ');
}
