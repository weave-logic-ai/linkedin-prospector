// Cron endpoint gating tests — Phase 3 Track F RSS family.
//
// Verifies that each of the three new cron routes:
//   1. Returns 404 when RESEARCH_FLAGS.sources is off.
//   2. Returns 401 when X-Cron-Secret is missing or wrong.
//   3. Returns 409 when the feature flag is on + auth is correct, but the
//      per-connector gate is off.
//
// The underlying connector + DB client are mocked so the routes never hit
// network or Postgres. We're validating route guards, not connector internals.

jest.mock('@/lib/db/client', () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
  transaction: jest.fn(),
  healthCheck: jest.fn(),
  getPool: jest.fn(),
}));

jest.mock('@/lib/db/tenants', () => ({
  getDefaultTenantId: jest
    .fn()
    .mockResolvedValue('00000000-0000-0000-0000-000000000001'),
}));

const buildReq = (secret?: string): unknown => ({
  headers: {
    get: (k: string) => {
      if (k.toLowerCase() === 'x-cron-secret') return secret ?? null;
      return null;
    },
  },
});

const PREV_ENV = { ...process.env };

beforeEach(() => {
  jest.resetModules();
  process.env = { ...PREV_ENV };
  process.env.CRON_SECRET = 'test-cron-secret';
});

afterAll(() => {
  process.env = PREV_ENV;
});

describe('POST /api/sources/cron/rss-poll', () => {
  it('returns 404 when RESEARCH_SOURCES flag is off', async () => {
    process.env.RESEARCH_SOURCES = 'false';
    const mod = await import('@/app/api/sources/cron/rss-poll/route');
    const res = await mod.POST(buildReq('test-cron-secret') as never);
    expect(res.status).toBe(404);
  });

  it('returns 401 when the cron secret is wrong', async () => {
    process.env.RESEARCH_SOURCES = 'true';
    process.env.RESEARCH_CONNECTOR_RSS = 'true';
    const mod = await import('@/app/api/sources/cron/rss-poll/route');
    const res = await mod.POST(buildReq('wrong-secret') as never);
    expect(res.status).toBe(401);
  });

  it('returns 401 when the cron secret header is absent', async () => {
    process.env.RESEARCH_SOURCES = 'true';
    const mod = await import('@/app/api/sources/cron/rss-poll/route');
    const res = await mod.POST(buildReq() as never);
    expect(res.status).toBe(401);
  });

  it('returns 409 when sources flag is on but RSS connector flag is off', async () => {
    process.env.RESEARCH_SOURCES = 'true';
    delete process.env.RESEARCH_CONNECTOR_RSS;
    const mod = await import('@/app/api/sources/cron/rss-poll/route');
    const res = await mod.POST(buildReq('test-cron-secret') as never);
    expect(res.status).toBe(409);
  });
});

describe('POST /api/sources/cron/google-news-refresh', () => {
  it('returns 404 when RESEARCH_SOURCES flag is off', async () => {
    process.env.RESEARCH_SOURCES = 'false';
    const mod = await import(
      '@/app/api/sources/cron/google-news-refresh/route'
    );
    const res = await mod.POST(buildReq('test-cron-secret') as never);
    expect(res.status).toBe(404);
  });

  it('returns 401 when the cron secret is wrong', async () => {
    process.env.RESEARCH_SOURCES = 'true';
    process.env.RESEARCH_CONNECTOR_GOOGLE_NEWS = 'true';
    const mod = await import(
      '@/app/api/sources/cron/google-news-refresh/route'
    );
    const res = await mod.POST(buildReq('bogus') as never);
    expect(res.status).toBe(401);
  });

  it('returns 409 when the per-connector flag is off', async () => {
    process.env.RESEARCH_SOURCES = 'true';
    delete process.env.RESEARCH_CONNECTOR_GOOGLE_NEWS;
    const mod = await import(
      '@/app/api/sources/cron/google-news-refresh/route'
    );
    const res = await mod.POST(buildReq('test-cron-secret') as never);
    expect(res.status).toBe(409);
  });
});

describe('POST /api/sources/cron/blog-discovery', () => {
  it('returns 404 when RESEARCH_SOURCES flag is off', async () => {
    process.env.RESEARCH_SOURCES = 'false';
    const mod = await import('@/app/api/sources/cron/blog-discovery/route');
    const res = await mod.POST(buildReq('test-cron-secret') as never);
    expect(res.status).toBe(404);
  });

  it('returns 401 when the cron secret is wrong', async () => {
    process.env.RESEARCH_SOURCES = 'true';
    process.env.RESEARCH_CONNECTOR_BLOG = 'true';
    const mod = await import('@/app/api/sources/cron/blog-discovery/route');
    const res = await mod.POST(buildReq('nope') as never);
    expect(res.status).toBe(401);
  });

  it('returns 409 when the per-connector flag is off', async () => {
    process.env.RESEARCH_SOURCES = 'true';
    delete process.env.RESEARCH_CONNECTOR_BLOG;
    const mod = await import('@/app/api/sources/cron/blog-discovery/route');
    const res = await mod.POST(buildReq('test-cron-secret') as never);
    expect(res.status).toBe(409);
  });
});
