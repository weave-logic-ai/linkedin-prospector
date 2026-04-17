// Chain-id formation for snippet ExoChain entries.
//
// Per ADR-029 (`docs/adr/ADR-029-exochain-snippet-chain-scope.md`) and
// `.planning/research-tools-sprint/10-decisions.md` Q3, snippet chains are
// scoped per-target and kind-qualified:
//
//   chain_id = 'snippet:' + target.kind + ':' + target.id
//
// Examples:
//   - snippet:contact:a8f2-…
//   - snippet:company:de91-…
//   - snippet:self:<owner_id>
//
// Each target therefore has its own Merkle-linked chain. Re-attribution of a
// snippet to a different target does not migrate entries — that is treated as
// a separate `snippet_edited` event on the original chain (ADR-029 §Negative).

export type SnippetTargetKind = 'self' | 'contact' | 'company';

/**
 * Build the ExoChain `chain_id` for a snippet attached to a given target.
 *
 * Invariant: this is a pure string-shape function — no I/O, no side effects.
 * The caller is responsible for ensuring `targetId` is a valid UUID owned by
 * the tenant before using the returned chain_id in writes.
 */
export function snippetChainId(
  targetKind: SnippetTargetKind,
  targetId: string
): string {
  if (!targetId || typeof targetId !== 'string') {
    throw new Error('snippetChainId: targetId must be a non-empty string');
  }
  if (targetKind !== 'self' && targetKind !== 'contact' && targetKind !== 'company') {
    throw new Error(
      `snippetChainId: targetKind must be one of self|contact|company, got "${targetKind}"`
    );
  }
  return `snippet:${targetKind}:${targetId}`;
}

/**
 * Parse a snippet chain_id back into its components. Returns null if the
 * string does not match the snippet chain shape — callers can use this to
 * filter mixed-chain-id collections (e.g. tenant-wide audit scans).
 */
export function parseSnippetChainId(
  chainId: string
): { kind: SnippetTargetKind; targetId: string } | null {
  const match = /^snippet:(self|contact|company):(.+)$/.exec(chainId);
  if (!match) return null;
  return {
    kind: match[1] as SnippetTargetKind,
    targetId: match[2],
  };
}
