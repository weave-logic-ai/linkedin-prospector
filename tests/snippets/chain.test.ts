// Snippet chain-id formula tests.
//
// ADR-029 (`docs/adr/ADR-029-exochain-snippet-chain-scope.md`) pins the shape:
//   chain_id = 'snippet:' + target.kind + ':' + target.id
// with kind ∈ {self, contact, company}. These tests prove the formula and
// that bad input is rejected loudly.

import { snippetChainId, parseSnippetChainId } from '@/lib/snippets/chain';

describe('snippetChainId', () => {
  it('forms a contact target chain_id', () => {
    const id = '11111111-2222-3333-4444-555555555555';
    expect(snippetChainId('contact', id)).toBe(
      `snippet:contact:${id}`
    );
  });

  it('forms a company target chain_id', () => {
    const id = 'aaaa-bbbb';
    expect(snippetChainId('company', id)).toBe(`snippet:company:aaaa-bbbb`);
  });

  it('forms a self target chain_id', () => {
    const id = 'owner-9';
    expect(snippetChainId('self', id)).toBe(`snippet:self:owner-9`);
  });

  it('throws on empty targetId', () => {
    expect(() => snippetChainId('contact', '')).toThrow(
      /targetId must be a non-empty string/
    );
  });

  it('throws on invalid targetKind', () => {
    // Cast through unknown to sneak the bad value past the compile-time guard.
    expect(() =>
      snippetChainId('event' as unknown as 'contact', 'id-1')
    ).toThrow(/targetKind must be one of self\|contact\|company/);
  });
});

describe('parseSnippetChainId', () => {
  it('round-trips a well-formed snippet chain_id', () => {
    const chainId = snippetChainId('contact', 'abc-123');
    const parsed = parseSnippetChainId(chainId);
    expect(parsed).toEqual({ kind: 'contact', targetId: 'abc-123' });
  });

  it('returns null for a non-snippet chain_id', () => {
    expect(parseSnippetChainId('source:tenant-1')).toBeNull();
    expect(parseSnippetChainId('random-uuid-here')).toBeNull();
  });

  it('parses company and self kinds', () => {
    expect(parseSnippetChainId('snippet:company:co-1')).toEqual({
      kind: 'company',
      targetId: 'co-1',
    });
    expect(parseSnippetChainId('snippet:self:owner-xyz')).toEqual({
      kind: 'self',
      targetId: 'owner-xyz',
    });
  });
});
