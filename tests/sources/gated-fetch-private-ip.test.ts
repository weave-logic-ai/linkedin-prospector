// gatedFetch SSRF integration — the service-level assertion that the
// private-IP guard is wired in before rate-limit / robots / fetch.
//
// We mock the DB + robots modules so the test exercises only the SSRF
// branch.

jest.mock('@/lib/db/client', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  healthCheck: jest.fn(),
  getPool: jest.fn(),
  shutdown: jest.fn(),
}));
jest.mock('@/lib/sources/robots', () => ({
  isAllowed: jest.fn(async () => ({ allowed: true, reason: 'allow' })),
}));
jest.mock('@/lib/sources/rate-limiter', () => ({
  acquire: jest.fn(async () => undefined),
  DEFAULT_BUCKETS: {},
}));

import { gatedFetch, SourceFetchError } from '@/lib/sources/service';

describe('sources/service gatedFetch SSRF', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('throws BLOCKED_IP for a literal 10/8 URL without calling fetch', async () => {
    const spy = jest.fn();
    global.fetch = spy as unknown as typeof global.fetch;
    const dnsLookup = jest.fn();
    await expect(
      gatedFetch('http://10.0.0.1/api', { tenantId: 't', dnsLookup })
    ).rejects.toMatchObject({
      name: 'SourceFetchError',
      code: 'BLOCKED_IP',
      reason: 'private_ip',
    });
    expect(spy).not.toHaveBeenCalled();
    expect(dnsLookup).not.toHaveBeenCalled();
  });

  it('throws BLOCKED_IP when DNS resolves to a link-local IP', async () => {
    const spy = jest.fn();
    global.fetch = spy as unknown as typeof global.fetch;
    await expect(
      gatedFetch('http://metadata.internal/latest', {
        tenantId: 't',
        dnsLookup: async () => [{ address: '169.254.169.254', family: 4 }],
      })
    ).rejects.toMatchObject({
      code: 'BLOCKED_IP',
      reason: 'link_local',
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('throws BLOCKED_IP for a multicast host', async () => {
    global.fetch = jest.fn() as unknown as typeof global.fetch;
    await expect(
      gatedFetch('http://239.255.0.1/', {
        tenantId: 't',
        dnsLookup: async () => [],
      })
    ).rejects.toMatchObject({ code: 'BLOCKED_IP', reason: 'multicast' });
  });

  it('throws BLOCKED_IP for loopback by default', async () => {
    const priorFlag = process.env.SOURCES_ALLOW_LOCALHOST;
    delete process.env.SOURCES_ALLOW_LOCALHOST;
    global.fetch = jest.fn() as unknown as typeof global.fetch;
    try {
      await expect(
        gatedFetch('http://127.0.0.1:3000/api', {
          tenantId: 't',
          dnsLookup: async () => [],
        })
      ).rejects.toMatchObject({ code: 'BLOCKED_IP', reason: 'loopback' });
    } finally {
      if (priorFlag !== undefined) process.env.SOURCES_ALLOW_LOCALHOST = priorFlag;
    }
  });

  it('error carries the structured { code, reason } expected by callers', async () => {
    global.fetch = jest.fn() as unknown as typeof global.fetch;
    try {
      await gatedFetch('http://192.168.1.1/', {
        tenantId: 't',
        dnsLookup: async () => [],
      });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SourceFetchError);
      expect((err as SourceFetchError).code).toBe('BLOCKED_IP');
      expect((err as SourceFetchError).reason).toBe('private_ip');
    }
  });
});
