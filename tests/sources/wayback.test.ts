// Wayback connector — CDX parse + snapshot selection + age-decay multiplier.
//
// We don't hit the network here; the CDX parse / timestamp selection / decay
// math are all pure and unit-testable. A full invoke() is harder to test in
// isolation because it chains gatedFetch + writeSourceRecord + storePageCache;
// that's covered by integration tests at the route level.

import {
  parseCdxResponse,
  parseCdxTimestamp,
  pickSnapshot,
  snapshotUrl,
  ageDecayMultiplier,
} from '@/lib/sources/connectors/wayback';

describe('sources/connectors/wayback', () => {
  it('parseCdxResponse returns snapshots skipping the header row', () => {
    const body = [
      ['timestamp', 'original'],
      ['20200101000000', 'https://linkedin.com/in/foo'],
      ['20240115093000', 'https://linkedin.com/in/foo'],
    ];
    const out = parseCdxResponse(body);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      timestamp: '20200101000000',
      original: 'https://linkedin.com/in/foo',
    });
  });

  it('parseCdxResponse filters malformed rows', () => {
    const body = [
      ['timestamp', 'original'],
      ['not-a-timestamp', 'https://example.com'],
      ['20200101000000', ''],
      ['20200101000000', 'https://example.com'],
    ];
    expect(parseCdxResponse(body)).toHaveLength(1);
  });

  it('parseCdxResponse handles empty or invalid input', () => {
    expect(parseCdxResponse([])).toEqual([]);
    expect(parseCdxResponse(null)).toEqual([]);
    expect(parseCdxResponse([['wrong', 'headers']])).toEqual([]);
  });

  it('parseCdxTimestamp converts 14-digit strings to UTC Date', () => {
    const d = parseCdxTimestamp('20240115093000');
    expect(d).not.toBeNull();
    expect(d?.toISOString()).toBe('2024-01-15T09:30:00.000Z');
  });

  it('parseCdxTimestamp returns null for bad input', () => {
    expect(parseCdxTimestamp('abc')).toBeNull();
    expect(parseCdxTimestamp('2024')).toBeNull();
  });

  it('pickSnapshot picks the most recent when no hint', () => {
    const snapshots = [
      { timestamp: '20200101000000', original: 'https://example.com' },
      { timestamp: '20240115093000', original: 'https://example.com' },
    ];
    const picked = pickSnapshot(snapshots);
    expect(picked?.timestamp).toBe('20240115093000');
  });

  it('pickSnapshot picks the nearest to the hint', () => {
    const snapshots = [
      { timestamp: '20200101000000', original: 'https://example.com' },
      { timestamp: '20220601000000', original: 'https://example.com' },
      { timestamp: '20240115093000', original: 'https://example.com' },
    ];
    const picked = pickSnapshot(snapshots, '20220701000000');
    expect(picked?.timestamp).toBe('20220601000000');
  });

  it('pickSnapshot returns null for empty array', () => {
    expect(pickSnapshot([])).toBeNull();
  });

  it('snapshotUrl builds the canonical Wayback URL', () => {
    const url = snapshotUrl('20240115093000', 'https://linkedin.com/in/foo');
    expect(url).toBe(
      'https://web.archive.org/web/20240115093000/https://linkedin.com/in/foo'
    );
  });

  it('ageDecayMultiplier returns 1.0 for fresh snapshots', () => {
    expect(ageDecayMultiplier(0)).toBe(1.0);
    expect(ageDecayMultiplier(-100)).toBe(1.0);
  });

  it('ageDecayMultiplier decays over time', () => {
    const oneYear = 365 * 24 * 60 * 60 * 1000;
    const sixYears = 6 * oneYear;
    const sixYearDecay = ageDecayMultiplier(sixYears);
    const oneYearDecay = ageDecayMultiplier(oneYear);
    expect(sixYearDecay).toBeLessThan(oneYearDecay);
    expect(oneYearDecay).toBeLessThan(1.0);
  });

  it('ageDecayMultiplier floors at 0.5', () => {
    const veryOld = 100 * 365 * 24 * 60 * 60 * 1000;
    expect(ageDecayMultiplier(veryOld)).toBe(0.5);
  });
});
