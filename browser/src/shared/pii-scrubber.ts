// WS-3 Phase 6 §9 — Browser-side PII scrubber.
//
// Mirrors `app/src/lib/snippets/pii-scrubber.ts` so the sidebar can warn the
// user before save AND the server can do a belt-and-braces second pass (the
// server is the authoritative scrubber because not all user input reaches
// this module — e.g. offline queue replays).
//
// Logic is identical to the server module; kept separate because the browser
// bundle can't import from `app/src/…` without extending esbuild's root.
//
// Tests for this file live under `tests/snippets/pii-scrubber.test.ts` via the
// server module — the logic is identical, so the server tests cover both.

export type PiiKind = 'email' | 'phone' | 'ssn' | 'credit-card';

export interface PiiDetectionResult {
  scrubbedText: string;
  hit: boolean;
  hits: Record<PiiKind, number>;
  detections: Array<{ kind: PiiKind; match: string; placeholder: string }>;
}

const PLACEHOLDER: Record<PiiKind, string> = {
  email: '[email]',
  phone: '[phone]',
  ssn: '[ssn]',
  'credit-card': '[credit-card]',
};

const PATTERNS: Array<{ kind: PiiKind; regex: RegExp }> = [
  {
    kind: 'credit-card',
    regex: /(?<![\w-])(?:\d[ -]?){12,18}\d(?![\w-])/g,
  },
  {
    kind: 'ssn',
    regex: /(?<![\w-])\d{3}[- ]?\d{2}[- ]?\d{4}(?![\w-])/g,
  },
  {
    kind: 'email',
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  },
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
      if (kind === 'credit-card' && !luhnOk(match)) return match;
      hits[kind] += 1;
      detections.push({ kind, match, placeholder: PLACEHOLDER[kind] });
      return PLACEHOLDER[kind];
    });
  }

  return { scrubbedText: working, hit: detections.length > 0, hits, detections };
}

export function summarizePiiDetection(result: PiiDetectionResult): string | null {
  if (!result.hit) return null;
  const parts: string[] = [];
  if (result.hits.email > 0) parts.push(`${result.hits.email} email`);
  if (result.hits.phone > 0) parts.push(`${result.hits.phone} phone`);
  if (result.hits.ssn > 0) parts.push(`${result.hits.ssn} SSN`);
  if (result.hits['credit-card'] > 0)
    parts.push(`${result.hits['credit-card']} credit-card`);
  return parts.join(', ');
}
