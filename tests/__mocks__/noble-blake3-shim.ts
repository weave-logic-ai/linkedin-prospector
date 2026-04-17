// Jest-only shim for @noble/hashes/blake3. Uses Node's built-in SHA-256 to
// produce a deterministic 32-byte digest. Hash tests verify algorithm-agnostic
// properties (determinism, length, uniqueness), so the underlying primitive
// does not need to be true BLAKE3 in unit tests.
import { createHash } from 'crypto';

export function blake3(input: Uint8Array): Uint8Array {
  const h = createHash('sha256');
  h.update(Buffer.from(input));
  return new Uint8Array(h.digest());
}
