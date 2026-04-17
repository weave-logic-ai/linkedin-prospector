// Research Tools Sprint — WS-4 Phase 4 Track H: breadcrumb hover time
// formatting tests.
//
// The breadcrumb hover card renders "Set {relative time}" — the helper must
// handle the "moments ago" edge (< 5s), seconds, minutes, hours, days, and
// malformed input without crashing.

import { formatBreadcrumbTime } from '@/lib/targets/breadcrumb-format';

describe('components/targets/breadcrumb time formatter', () => {
  const NOW = new Date('2026-04-17T12:00:00.000Z').getTime();

  it('returns "now" for <5 second diffs', () => {
    expect(
      formatBreadcrumbTime('2026-04-17T11:59:58.000Z', NOW)
    ).toBe('now');
  });

  it('formats seconds / minutes / hours / days', () => {
    expect(formatBreadcrumbTime('2026-04-17T11:59:15.000Z', NOW)).toBe('45s ago');
    expect(formatBreadcrumbTime('2026-04-17T11:48:00.000Z', NOW)).toBe('12m ago');
    expect(formatBreadcrumbTime('2026-04-17T09:00:00.000Z', NOW)).toBe('3h ago');
    expect(formatBreadcrumbTime('2026-04-12T12:00:00.000Z', NOW)).toBe('5d ago');
  });

  it('returns empty string for malformed timestamps', () => {
    expect(formatBreadcrumbTime('', NOW)).toBe('');
    expect(formatBreadcrumbTime('not-a-date', NOW)).toBe('');
  });

  it('clamps negative diffs (future timestamps) to "now"', () => {
    expect(
      formatBreadcrumbTime('2026-04-17T12:30:00.000Z', NOW)
    ).toBe('now');
  });
});
