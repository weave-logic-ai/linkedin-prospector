// Research Tools Sprint — WS-4 Phase 4 Track H: shared formatter used by
// `target-breadcrumbs.tsx` and other UI that needs the same relative-time
// shape. Extracted to its own module so unit tests don't need to load the
// React / lucide-react tree just to verify date math.

/**
 * Format a past ISO timestamp as a compact relative string.
 * Returns "now" for <5s diffs, "Ns ago", "Nm ago", "Nh ago", "Nd ago".
 * Returns "" for malformed input so callers can fall through to nothing.
 */
export function formatBreadcrumbTime(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, now - t);
  const sec = Math.round(diff / 1000);
  if (sec < 5) return 'now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.round(hr / 24);
  return `${days}d ago`;
}
