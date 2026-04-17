/**
 * Hash utility for ExoChain entry integrity.
 * Uses BLAKE3 via @noble/hashes. Deterministic: same input -> same output.
 * Output is a lowercase hex-encoded 32-byte (256-bit) digest.
 */

import { blake3 } from '@noble/hashes/blake3.js';

export async function computeEntryHash(
  prevHash: string | null,
  operation: string,
  data: Record<string, unknown>,
  timestamp: string
): Promise<string> {
  const input = [
    prevHash ?? '',
    operation,
    JSON.stringify(data),
    timestamp,
  ].join('|');

  const encoder = new TextEncoder();
  const hashBytes = blake3(encoder.encode(input));
  const hashArray = Array.from(hashBytes);
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify a chain's integrity by recomputing hashes from entry 0 to N.
 */
export async function verifyChainHashes(
  entries: Array<{ prevHash: string | null; entryHash: string; operation: string; data: Record<string, unknown>; createdAt: string }>
): Promise<{ valid: boolean; brokenAt?: number }> {
  let expectedPrevHash: string | null = null;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // Verify prev_hash linkage
    if (i === 0 && entry.prevHash !== null) {
      return { valid: false, brokenAt: 0 };
    }
    if (i > 0 && entry.prevHash !== expectedPrevHash) {
      return { valid: false, brokenAt: i };
    }

    // Recompute hash
    const recomputed = await computeEntryHash(
      entry.prevHash,
      entry.operation,
      entry.data,
      entry.createdAt
    );

    if (recomputed !== entry.entryHash) {
      return { valid: false, brokenAt: i };
    }

    expectedPrevHash = entry.entryHash;
  }

  return { valid: true };
}
