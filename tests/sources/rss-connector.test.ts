// RSS connector — dedup / republication-multiplier / enablement tests.

jest.mock('@/lib/db/client', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
}));

import { query } from '@/lib/db/client';
import {
  computeRepublicationMultiplier,
  isRssConnectorEnabled,
} from '@/lib/sources/connectors/rss';

const queryMock = query as unknown as jest.Mock;

describe('isRssConnectorEnabled', () => {
  const PREV = process.env.RESEARCH_CONNECTOR_RSS;
  afterEach(() => {
    process.env.RESEARCH_CONNECTOR_RSS = PREV;
  });
  it('defaults to false', () => {
    delete process.env.RESEARCH_CONNECTOR_RSS;
    expect(isRssConnectorEnabled()).toBe(false);
  });
  it('is true only for exact "true"', () => {
    process.env.RESEARCH_CONNECTOR_RSS = 'true';
    expect(isRssConnectorEnabled()).toBe(true);
    process.env.RESEARCH_CONNECTOR_RSS = 'on';
    expect(isRssConnectorEnabled()).toBe(false);
  });
});

describe('computeRepublicationMultiplier', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('returns 1.0 when no other feeds have republished the link', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ distinct_feeds: '0' }] });
    const mult = await computeRepublicationMultiplier(
      'tenant-1',
      'https://example.com/story',
      'https://src.example.com/feed'
    );
    expect(mult).toBe(1.0);
  });

  it('returns 1.0 when 1 other feed (below the threshold of 2)', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ distinct_feeds: '1' }] });
    const mult = await computeRepublicationMultiplier(
      'tenant-1',
      'https://example.com/story',
      'https://src.example.com/feed'
    );
    expect(mult).toBe(1.0);
  });

  it('returns 1.2 when >= 2 distinct other feeds carry the link', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ distinct_feeds: '2' }] });
    const mult = await computeRepublicationMultiplier(
      'tenant-1',
      'https://example.com/story',
      'https://src.example.com/feed'
    );
    expect(mult).toBe(1.2);
  });

  it('still returns 1.2 for large cross-feed counts', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ distinct_feeds: '17' }] });
    const mult = await computeRepublicationMultiplier(
      'tenant-1',
      'https://example.com/story',
      'https://src.example.com/feed'
    );
    expect(mult).toBe(1.2);
  });

  it('excludes the source feed from the comparison (correct WHERE clause)', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ distinct_feeds: '0' }] });
    await computeRepublicationMultiplier(
      'tenant-1',
      'https://example.com/story',
      'https://src.example.com/feed'
    );
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/feedUrl.*<>.*\$3/);
    expect(params).toEqual([
      'tenant-1',
      'https://example.com/story',
      'https://src.example.com/feed',
    ]);
  });
});
