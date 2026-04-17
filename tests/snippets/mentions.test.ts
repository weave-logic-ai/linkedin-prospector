// Proper-noun bigram extractor tests.
//
// §5 of `.planning/research-tools-sprint/03-snippet-editor.md` scopes us to
// obvious `First Last` bigrams. These tests pin that exact shape and the
// unique-by-first-appearance ordering.

import {
  extractMentionContext,
  extractPersonMentionCandidates,
} from '@/lib/snippets/mentions';

describe('extractPersonMentionCandidates', () => {
  it('returns an empty array for empty input', () => {
    expect(extractPersonMentionCandidates('')).toEqual([]);
    expect(extractPersonMentionCandidates(null as unknown as string)).toEqual([]);
  });

  it('extracts a single First Last bigram', () => {
    const out = extractPersonMentionCandidates(
      'We interviewed Jane Doe last week about the role.'
    );
    expect(out.map((c) => c.text)).toEqual(['Jane Doe']);
    expect(out[0].offset).toBe(15);
  });

  it('extracts multiple bigrams in order of first appearance', () => {
    const out = extractPersonMentionCandidates(
      'Alice Smith met Bob Jones at the conference; Alice Smith stayed longer.'
    );
    expect(out.map((c) => c.text)).toEqual(['Alice Smith', 'Bob Jones']);
  });

  it('ignores all-lowercase bigrams', () => {
    expect(extractPersonMentionCandidates('big green apple')).toEqual([]);
  });

  it('ignores bigrams shorter than 5 chars', () => {
    // "A B" has capitals but is too short. The /[a-z]+/ part in the regex
    // already rejects single-letter tokens, so this is belt-and-braces.
    expect(extractPersonMentionCandidates('A B came through.')).toEqual([]);
  });

  it('extractMentionContext clips around the match with ellipses', () => {
    const text =
      'In 2024 Acme announced that Jane Doe joined as CTO, leaving TechCo after a decade.';
    const ctx = extractMentionContext(text, 'Jane Doe', 10);
    // Radius=10 on each side plus the mention token "Jane Doe" → ~28 chars.
    expect(ctx).toMatch(/Jane Doe/);
    expect(ctx.startsWith('…')).toBe(true);
    expect(ctx.endsWith('…')).toBe(true);
    expect(ctx.length).toBeLessThanOrEqual('Jane Doe'.length + 20 + 2);
  });

  it('extractMentionContext falls back to a leading window when mention absent', () => {
    const text = 'No match here at all.';
    const ctx = extractMentionContext(text, 'Jane Doe', 100);
    // No `Jane Doe` → returns the leading window (up to 2*radius chars).
    expect(ctx).toBe('No match here at all.');
  });

  it('emits non-overlapping bigrams across a Title Case run', () => {
    // "The North Atlantic Treaty Organisation" is a sequence of capitalised
    // words. /g with \b consumes left-to-right — so the regex emits the first
    // match ("The North"), advances past it, and finds "Atlantic Treaty"
    // next. This is good enough for Phase 1: the user confirms each match
    // in the widget dropdown and rejects false positives.
    const out = extractPersonMentionCandidates(
      'The North Atlantic Treaty Organisation was formed.'
    );
    expect(out.map((c) => c.text)).toEqual([
      'The North',
      'Atlantic Treaty',
    ]);
  });
});
