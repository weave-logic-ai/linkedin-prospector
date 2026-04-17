// WS-2 §14 — GitHub webhook dispatcher tests.
//
// Happy-path: env URL set → POST fires with the correct payload shape.
// Failure:    5xx on every attempt → returns dispatched=false, never throws.
// Env-unset:  no URL configured → skipped silently.

import {
  buildRegressionPayload,
  dispatchRegressionToGithub,
} from '@/lib/analytics/github-webhook';

describe('buildRegressionPayload', () => {
  it('includes parser-regression + lowercased pageType in labels', () => {
    const p = buildRegressionPayload({
      captureId: '11111111-1111-1111-1111-111111111111',
      pageType: 'PROFILE',
      domPath: 'main > section.ph5',
      textPreview: 'About: Jane leads …',
      userNote: 'looks wrong',
      flagId: '22222222-2222-2222-2222-222222222222',
    });
    expect(p.labels).toContain('parser-regression');
    expect(p.labels).toContain('profile');
    expect(p.title).toMatch(/Parser regression: PROFILE/);
    expect(p.body).toContain('main > section.ph5');
    expect(p.body).toContain('looks wrong');
    expect(p.body).toContain('22222222-2222-2222-2222-222222222222');
  });

  it('omits user-note section when blank', () => {
    const p = buildRegressionPayload({
      captureId: '11111111-1111-1111-1111-111111111111',
      pageType: 'COMPANY',
      domPath: 'main > div',
    });
    expect(p.body).not.toMatch(/User note/);
    expect(p.labels).toContain('company');
  });

  it('deduplicates labels when pageType === parser-regression label', () => {
    const p = buildRegressionPayload({
      captureId: '11111111-1111-1111-1111-111111111111',
      pageType: 'parser-regression',
      domPath: 'main',
    });
    const count = p.labels.filter((l) => l === 'parser-regression').length;
    expect(count).toBe(1);
  });
});

describe('dispatchRegressionToGithub — happy path', () => {
  it('POSTs the payload to the configured webhook URL', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 201,
    })) as unknown as typeof fetch;

    const result = await dispatchRegressionToGithub(
      { title: 't', body: 'b', labels: ['parser-regression'] },
      {
        webhookUrl: 'https://hooks.example.test/gh',
        webhookToken: 'ghp_fake',
        fetchImpl,
      }
    );
    expect(result.dispatched).toBe(true);
    expect(result.status).toBe(201);
    expect(result.attempts).toBe(1);

    const [url, init] = (fetchImpl as unknown as jest.Mock).mock.calls[0];
    expect(url).toBe('https://hooks.example.test/gh');
    expect((init as RequestInit).method).toBe('POST');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer ghp_fake');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      title: 't',
      body: 'b',
      labels: ['parser-regression'],
    });
  });
});

describe('dispatchRegressionToGithub — failure modes', () => {
  it('no-ops cleanly when no webhook URL is configured', async () => {
    const fetchImpl = jest.fn() as unknown as typeof fetch;
    const result = await dispatchRegressionToGithub(
      { title: 't', body: 'b', labels: [] },
      { webhookUrl: null, fetchImpl }
    );
    expect(result.dispatched).toBe(false);
    expect(result.attempts).toBe(0);
    expect(result.skippedReason).toBe('no-webhook-url');
    expect((fetchImpl as unknown as jest.Mock).mock.calls.length).toBe(0);
  });

  it('retries on 5xx and eventually gives up', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: false,
      status: 502,
    })) as unknown as typeof fetch;
    const sleepImpl = jest.fn(async () => undefined);

    const result = await dispatchRegressionToGithub(
      { title: 't', body: 'b', labels: [] },
      {
        webhookUrl: 'https://hooks.example.test/gh',
        maxAttempts: 3,
        fetchImpl,
        sleepImpl,
      }
    );

    expect(result.dispatched).toBe(false);
    expect(result.attempts).toBe(3);
    expect(result.status).toBe(502);
    expect((fetchImpl as unknown as jest.Mock).mock.calls.length).toBe(3);
  });

  it('does not retry on a 4xx response', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: false,
      status: 422,
    })) as unknown as typeof fetch;

    const result = await dispatchRegressionToGithub(
      { title: 't', body: 'b', labels: [] },
      {
        webhookUrl: 'https://hooks.example.test/gh',
        maxAttempts: 3,
        fetchImpl,
      }
    );
    expect(result.dispatched).toBe(false);
    expect(result.attempts).toBe(1);
    expect(result.status).toBe(422);
  });

  it('swallows fetch throws (network errors) and reports failure', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const sleepImpl = jest.fn(async () => undefined);

    const result = await dispatchRegressionToGithub(
      { title: 't', body: 'b', labels: [] },
      {
        webhookUrl: 'https://hooks.example.test/gh',
        maxAttempts: 2,
        fetchImpl,
        sleepImpl,
      }
    );
    expect(result.dispatched).toBe(false);
    expect(result.attempts).toBe(2);
    expect(result.error).toMatch(/ECONNREFUSED/);
  });
});
