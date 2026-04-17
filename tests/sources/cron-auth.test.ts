// Cron auth — shared-secret header enforcement.
//
// Covers:
//   1. Missing CRON_SECRET env → always 401.
//   2. Wrong header → 401.
//   3. Right header → passes.
//   4. Timing-safe compare does not crash on mismatched lengths.

import { isCronAuthorized } from '@/lib/sources/cron-auth';

describe('sources/cron-auth', () => {
  const originalEnv = process.env.CRON_SECRET;

  afterEach(() => {
    process.env.CRON_SECRET = originalEnv;
  });

  /**
   * Minimal NextRequest-ish stand-in. We only touch `headers.get()` in the
   * auth helper so a tiny fake is enough; this keeps the test off next/server.
   */
  function req(headers: Record<string, string> = {}) {
    return {
      headers: {
        get(name: string) {
          return headers[name.toLowerCase()] ?? null;
        },
      },
    } as unknown as Parameters<typeof isCronAuthorized>[0];
  }

  it('rejects when CRON_SECRET is not set', () => {
    delete process.env.CRON_SECRET;
    expect(isCronAuthorized(req({ 'x-cron-secret': 'anything' }))).toBe(false);
  });

  it('rejects wrong secret', () => {
    process.env.CRON_SECRET = 'topsecret123';
    expect(isCronAuthorized(req({ 'x-cron-secret': 'wrong' }))).toBe(false);
  });

  it('rejects when header is missing', () => {
    process.env.CRON_SECRET = 'topsecret123';
    expect(isCronAuthorized(req({}))).toBe(false);
  });

  it('accepts matching secret', () => {
    process.env.CRON_SECRET = 'topsecret123';
    expect(
      isCronAuthorized(req({ 'x-cron-secret': 'topsecret123' }))
    ).toBe(true);
  });

  it('does not crash on different-length secrets', () => {
    process.env.CRON_SECRET = 'short';
    expect(
      isCronAuthorized(req({ 'x-cron-secret': 'longerthanshort' }))
    ).toBe(false);
  });
});
