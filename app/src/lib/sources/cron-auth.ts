// Shared-secret auth for cron endpoints.
//
// Reads the required secret from `CRON_SECRET` env. Requests must include
// `X-Cron-Secret: <value>`. Timing-safe comparison to avoid trivial timing
// attacks.

import crypto from 'crypto';
import { NextRequest } from 'next/server';

export function isCronAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // Fail closed when secret is not configured — never allow unauth cron.
    return false;
  }
  const provided = req.headers.get('x-cron-secret') ?? '';
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(provided),
    Buffer.from(expected)
  );
}
