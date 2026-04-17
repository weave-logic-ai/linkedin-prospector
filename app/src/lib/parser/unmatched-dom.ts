// Unmatched-DOM detection. Per `01-parser-audit.md` §4.4.
//
// After a parser has run we walk the document one more time looking for
// "large unexplained blocks" — sections / divs with non-trivial text that
// weren't consumed by any primary selector, heuristic, or fallback. The
// result feeds the WS-2 sidebar "Report as regression" panel (WS-2 ships
// in Phase 2; this file owns the data).
//
// The walker is deliberately conservative:
//   - skips scripts, styles, and known-chrome (nav, header, footer)
//   - treats an element as "matched" if any of its descendants produced a
//     selector / heuristic / fallback hit during parsing
//   - emits at most `MAX_ENTRIES` hits so a hostile page cannot blow up the
//     response size

import type { CheerioAPI } from 'cheerio';
import type { AnyNode, Element as DomElement } from 'domhandler';
import type { ExtractedField, UnmatchedDomEntry } from './types';

/** Skip these tag names outright. */
const SKIP_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'head',
  'meta',
  'link',
  'title',
  'nav',
  'header',
  'footer',
  'svg',
  'picture',
  'iframe',
  'template',
]);

/** Text length at which a block is considered "large enough" to report. */
const MIN_TEXT_LENGTH = 80;

/** Hard cap on entries so we never balloon the response. */
const MAX_ENTRIES = 20;

/** Cheerio is loosely typed; this narrows Element for us. */
function isElement(node: AnyNode): node is DomElement {
  return node.type === 'tag';
}

function tagName(node: DomElement): string {
  return (node.name || '').toLowerCase();
}

/** Compute an approximate DOM path, using tag + first class + nth-of-type. */
function computeDomPath($: CheerioAPI, el: DomElement): string {
  const parts: string[] = [];
  let current: AnyNode | null = el;
  while (current && isElement(current)) {
    const node: DomElement = current;
    const t = tagName(node);
    const firstClass = (node.attribs?.class ?? '').split(/\s+/)[0];
    let segment = t;
    if (firstClass) segment += `.${firstClass}`;
    // nth-of-type approximation via siblings
    const $node = $(node);
    const siblings = $node.parent().children(t);
    if (siblings.length > 1) {
      const idx = siblings.toArray().indexOf(node);
      if (idx >= 0) segment += `:nth-of-type(${idx + 1})`;
    }
    parts.unshift(segment);
    current = node.parent;
    if (parts.length >= 6) break; // keep paths readable
  }
  return parts.join(' > ');
}

/** Collect a set of selector strings that matched during parsing. */
export function collectMatchedSelectors(
  fields: ReadonlyArray<ExtractedField>
): Set<string> {
  const out = new Set<string>();
  for (const f of fields) {
    if (!f.value || f.value === null) continue;
    if (f.selectorUsed) out.add(f.selectorUsed);
  }
  return out;
}

/**
 * Given a parsed document and the fields the parser produced, return a list
 * of DOM sections that look substantial but did not produce any matched
 * selector. Empty when nothing is interesting.
 */
export function findUnmatchedDom(
  $: CheerioAPI,
  fields: ReadonlyArray<ExtractedField>
): UnmatchedDomEntry[] {
  const matchedSelectors = collectMatchedSelectors(fields);

  // Build a set of DOM nodes that the matched selectors hit. We use a
  // WeakSet to dedup on node identity. Any ancestor of a matched node is
  // also "covered" — reporting it would just be noise.
  const coveredNodes = new WeakSet<object>();
  for (const sel of matchedSelectors) {
    if (!sel || sel.startsWith('fallback:') || sel.startsWith('heuristic:')) continue;
    try {
      $(sel).each((_idx, node) => {
        // Mark this node + every ancestor as covered.
        let cur: AnyNode | null = node;
        while (cur && isElement(cur)) {
          coveredNodes.add(cur);
          cur = cur.parent;
        }
      });
    } catch {
      // Invalid selector, skip it
    }
  }

  const out: UnmatchedDomEntry[] = [];
  const visited = new WeakSet<object>();

  // Walk only substantive containers so we don't emit one entry per leaf.
  const candidates = $('section, div[aria-labelledby], div[role="region"], main > div');

  candidates.each((_idx, raw) => {
    if (out.length >= MAX_ENTRIES) return;
    if (!isElement(raw)) return;
    if (SKIP_TAGS.has(tagName(raw))) return;
    if (visited.has(raw)) return;

    // If this node or any of its ancestors was covered by a matched selector,
    // skip it — we are only interested in pure-unmatched blocks.
    if (coveredNodes.has(raw)) return;

    // Skip if any descendant matched (we would double-report via the parent).
    let anyDescMatched = false;
    $(raw).find('*').each((_i, desc) => {
      if (isElement(desc) && coveredNodes.has(desc)) anyDescMatched = true;
    });
    if (anyDescMatched) return;

    const text = $(raw).text().replace(/\s+/g, ' ').trim();
    if (text.length < MIN_TEXT_LENGTH) return;

    // Remember this node + its descendants so a sibling walker doesn't
    // re-emit them.
    visited.add(raw);
    $(raw).find('*').each((_i, d) => {
      if (isElement(d)) visited.add(d);
    });

    const domPath = computeDomPath($, raw);
    const html = $.html(raw as unknown as Parameters<typeof $.html>[0]) ?? '';
    out.push({
      domPath,
      textPreview: text.slice(0, 160),
      byteLength: html.length,
    });
  });

  return out;
}

/** In-place populate on a parse result. */
export function populateUnmatchedDom(
  $: CheerioAPI,
  result: { fields: ExtractedField[]; unmatched?: UnmatchedDomEntry[] }
): void {
  try {
    result.unmatched = findUnmatchedDom($, result.fields);
  } catch {
    // Walker failure must never fail a parse.
    result.unmatched = [];
  }
}
