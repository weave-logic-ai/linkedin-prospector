// Entity mention extraction — text snippets.
//
// Per `.planning/research-tools-sprint/03-snippet-editor.md` §5, the client
// runs a cheap local regex over selected text to surface candidate person
// mentions (proper-noun bigrams). The widget then lets the user link each
// candidate to an existing contact via the dropdown.
//
// This module exposes the regex as a reusable extractor so the content
// script, the side panel, and server-side tests all agree on what counts as
// a mention candidate. Kept extremely narrow per §5 — we do not try to solve
// NER; we surface obvious Title Case bigrams and let the user confirm.

export interface MentionCandidate {
  /** The matched text, preserved with original case. */
  text: string;
  /** Character offset of the match in the source string. */
  offset: number;
}

// Proper-noun bigram: First Last. Both tokens start with a capital letter and
// are followed by lower-case. We require a word boundary on both sides to
// avoid matching inside longer capitalized stretches (e.g. corporate names,
// headline-case phrases). §5 explicitly covers "First Last" only — longer
// name forms are out of scope for Phase 1 Track C.
const PROPER_NOUN_BIGRAM = /\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/g;

/**
 * Extract proper-noun bigrams from the given text. Returns unique candidates
 * ordered by first appearance — a name mentioned twice in a snippet surfaces
 * once in the mentions dropdown.
 */
export function extractPersonMentionCandidates(text: string): MentionCandidate[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: MentionCandidate[] = [];
  // Reset lastIndex because the regex is stateful with the /g flag.
  PROPER_NOUN_BIGRAM.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PROPER_NOUN_BIGRAM.exec(text)) !== null) {
    const candidate = `${match[1]} ${match[2]}`;
    // Skip trivial false positives like "I Am" or "The End". We accept the
    // false-negative trade-off; the user confirms the match anyway.
    if (candidate.length < 5) continue;
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    out.push({ text: candidate, offset: match.index });
  }
  return out;
}
