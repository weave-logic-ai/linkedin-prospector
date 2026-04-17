// webhook handler tests
//
// Covers:
//   - 2xx success path (returns { dispatched: true, status, durationMs })
//   - 4xx client error (returns { dispatched: false, status, reason: 'http_4xx' })
//   - 5xx server error (returns { dispatched: false, status, reason: 'http_5xx' })
//   - AbortController-driven timeout (returns { dispatched: false, reason: 'timeout' })
//   - HMAC-SHA256 signature header present when `secret` is configured
//   - Missing target_url fails gracefully (no throw)
//
// `fetch` is mocked via jest.spyOn(global, 'fetch'). We never hit real URLs.

import { createHmac } from 'crypto';
import { executeWebhook } from '@/lib/ecc/impulses/handlers/webhook';
import type { Impulse } from '@/lib/ecc/types';

function baseImpulse(overrides: Partial<Impulse> = {}): Impulse {
  return {
    id: 'imp-1',
    tenantId: 't-1',
    impulseType: 'tier_changed',
    sourceEntityType: 'contact',
    sourceEntityId: 'c1',
    payload: { from: 'silver', to: 'gold' },
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function mockResponse(status: number): Response {
  // Only .status is consumed; the rest is ignored by the handler.
  return { status, ok: status >= 200 && status < 300 } as unknown as Response;
}

describe('executeWebhook', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns dispatched:true on 2xx response and posts JSON envelope', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(200));

    const result = await executeWebhook(baseImpulse(), {
      target_url: 'https://example.test/hook',
    });

    expect(result.dispatched).toBe(true);
    expect(result.status).toBe(200);
    expect(typeof result.durationMs).toBe('number');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.test/hook');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      impulseId: 'imp-1',
      impulseType: 'tier_changed',
      sourceEntityType: 'contact',
      sourceEntityId: 'c1',
      payload: { from: 'silver', to: 'gold' },
      emittedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('returns dispatched:false with http_4xx reason on client error', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(404));

    const result = await executeWebhook(baseImpulse(), {
      target_url: 'https://example.test/hook',
    });

    expect(result.dispatched).toBe(false);
    expect(result.status).toBe(404);
    expect(result.reason).toBe('http_404');
  });

  it('returns dispatched:false with http_5xx reason on server error', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(503));

    const result = await executeWebhook(baseImpulse(), {
      target_url: 'https://example.test/hook',
    });

    expect(result.dispatched).toBe(false);
    expect(result.status).toBe(503);
    expect(result.reason).toBe('http_503');
  });

  it('returns dispatched:false with reason=timeout when AbortController fires', async () => {
    // Simulate fetch hanging until the handler's AbortController aborts.
    fetchSpy.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          const signal = init.signal;
          if (signal) {
            if (signal.aborted) {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
              return;
            }
            signal.addEventListener('abort', () => {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }
        })
    );

    const result = await executeWebhook(baseImpulse(), {
      target_url: 'https://example.test/hook',
      timeout_ms: 100, // minimum — parseConfig clamps to >= 100
    });

    expect(result.dispatched).toBe(false);
    expect(result.reason).toBe('timeout');
  });

  it('returns dispatched:false with network: reason on DNS/connection failure', async () => {
    // Node's undici throws TypeError('fetch failed') with a .cause for these.
    const netErr = new TypeError('fetch failed');
    fetchSpy.mockRejectedValueOnce(netErr);

    const result = await executeWebhook(baseImpulse(), {
      target_url: 'https://nonexistent.invalid/hook',
    });

    expect(result.dispatched).toBe(false);
    expect(typeof result.reason).toBe('string');
    expect(result.reason as string).toMatch(/^network:/);
  });

  it('attaches X-NetworkNav-Signature header when secret is configured', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(200));

    const secret = 'shhh-super-secret';
    const impulse = baseImpulse();

    await executeWebhook(impulse, {
      target_url: 'https://example.test/hook',
      secret,
    });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    const sigHeader = headers['X-NetworkNav-Signature'];
    expect(sigHeader).toBeDefined();
    expect(sigHeader.startsWith('sha256=')).toBe(true);

    // Recompute the expected signature over the exact body that was sent.
    const expected = createHmac('sha256', secret).update(init.body as string).digest('hex');
    expect(sigHeader).toBe(`sha256=${expected}`);
  });

  it('does not attach a signature header when no secret is configured', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(200));

    await executeWebhook(baseImpulse(), {
      target_url: 'https://example.test/hook',
    });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['X-NetworkNav-Signature']).toBeUndefined();
  });

  it('merges custom headers from config and honors a custom HTTP method', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(204));

    await executeWebhook(baseImpulse(), {
      target_url: 'https://example.test/hook',
      method: 'put',
      headers: { 'X-Extra': 'yes', Authorization: 'Bearer token' },
    });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('PUT');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Extra']).toBe('yes');
    expect(headers['Authorization']).toBe('Bearer token');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('returns dispatched:false without throwing when target_url is missing', async () => {
    const result = await executeWebhook(baseImpulse(), {});
    expect(result.dispatched).toBe(false);
    expect(result.reason).toBe('missing_target_url');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects non-http(s) URL schemes without calling fetch', async () => {
    const result = await executeWebhook(baseImpulse(), {
      target_url: 'file:///etc/passwd',
    });
    expect(result.dispatched).toBe(false);
    expect(result.reason).toBe('invalid_target_url');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
