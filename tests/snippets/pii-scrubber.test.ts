// WS-3 Phase 6 §9 — PII scrubber unit tests.
//
// Regex-driven: we cover the four shapes the sprint brief calls out (emails,
// phones, SSNs, credit cards) plus the Luhn gating on credit-card shape.

import {
  detectAndScrubPii,
  summarizePiiDetection,
  type PiiKind,
} from '@/lib/snippets/pii-scrubber';

describe('detectAndScrubPii — detections', () => {
  it('leaves clean text untouched', () => {
    const r = detectAndScrubPii('Jane Doe leads the revenue org at Acme');
    expect(r.hit).toBe(false);
    expect(r.scrubbedText).toBe('Jane Doe leads the revenue org at Acme');
    expect(r.detections).toHaveLength(0);
    expect(r.hits).toEqual({ email: 0, phone: 0, ssn: 0, 'credit-card': 0 });
  });

  it('scrubs an email and flags it', () => {
    const r = detectAndScrubPii('Reach Jane at jane.doe+test@example.com tomorrow');
    expect(r.hit).toBe(true);
    expect(r.scrubbedText).toBe('Reach Jane at [email] tomorrow');
    expect(r.hits.email).toBe(1);
  });

  it('scrubs US phone shapes', () => {
    const r = detectAndScrubPii('Call 415-555-2671 before noon');
    expect(r.hit).toBe(true);
    expect(r.scrubbedText).toBe('Call [phone] before noon');
    expect(r.hits.phone).toBe(1);
  });

  it('scrubs an SSN-shape', () => {
    const r = detectAndScrubPii('SSN on file: 123-45-6789 per HR');
    expect(r.hit).toBe(true);
    expect(r.scrubbedText).toBe('SSN on file: [ssn] per HR');
    expect(r.hits.ssn).toBe(1);
  });

  it('scrubs a Luhn-valid credit-card number', () => {
    // 4111 1111 1111 1111 — the canonical VISA test number (Luhn-valid).
    const r = detectAndScrubPii('Card used: 4111 1111 1111 1111 — confirmed');
    expect(r.hit).toBe(true);
    expect(r.scrubbedText).toBe('Card used: [credit-card] — confirmed');
    expect(r.hits['credit-card']).toBe(1);
  });

  it('leaves a Luhn-invalid 16-digit run alone (no credit-card hit)', () => {
    // 16 digits that do NOT pass Luhn. The phone regex may still grab a sub-
    // slice (that's a known tradeoff of the aggressive phone pattern), but
    // the credit-card hit count must be zero because Luhn failed.
    const r = detectAndScrubPii('Ref 1234 5678 9012 3457 filed');
    expect(r.hits['credit-card']).toBe(0);
  });

  it('handles multi-kind PII in one pass and reports each hit', () => {
    const input =
      'Contact jane@example.com · Phone +1 415.555.2671 · SSN 123-45-6789';
    const r = detectAndScrubPii(input);
    expect(r.hit).toBe(true);
    expect(r.scrubbedText).toBe(
      'Contact [email] · Phone [phone] · SSN [ssn]'
    );
    expect(r.hits).toEqual({
      email: 1,
      phone: 1,
      ssn: 1,
      'credit-card': 0,
    });
    const kinds = r.detections.map((d) => d.kind).sort();
    const expected: PiiKind[] = ['email', 'phone', 'ssn'];
    expect(kinds).toEqual(expected.sort());
  });

  it('is deterministic across repeated invocations', () => {
    const input = 'Ping jane@example.com at 415-555-2671';
    const a = detectAndScrubPii(input);
    const b = detectAndScrubPii(input);
    expect(a.scrubbedText).toBe(b.scrubbedText);
    expect(a.hits).toEqual(b.hits);
  });
});

describe('summarizePiiDetection — banner copy', () => {
  it('returns null when nothing was detected', () => {
    expect(summarizePiiDetection(detectAndScrubPii('clean text'))).toBeNull();
  });

  it('lists the kinds that hit in plural form', () => {
    const s = summarizePiiDetection(
      detectAndScrubPii('a@b.com x@y.com 415-555-2671')
    );
    expect(s).not.toBeNull();
    expect(s).toMatch(/2 email/);
    expect(s).toMatch(/1 phone/);
  });
});
