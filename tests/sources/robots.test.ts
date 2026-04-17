// robots.txt parser tests.
//
// The DB-caching path is not exercised here (requires a live Postgres); we
// pin the pure parse + match logic. isAllowed() integration is covered by the
// live-DB e2e layer.

import { parseRobotsTxt, isPathAllowed } from '@/lib/sources/robots';

describe('sources/robots parser', () => {
  it('parses a simple allow/disallow file', () => {
    const body = `
User-agent: *
Disallow: /private
Allow: /public
    `.trim();
    const groups = parseRobotsTxt(body);
    expect(groups).toHaveLength(1);
    expect(groups[0].userAgent).toBe('*');
    expect(groups[0].disallow).toContain('/private');
    expect(groups[0].allow).toContain('/public');
  });

  it('splits on User-agent boundaries', () => {
    const body = `
User-agent: Googlebot
Disallow: /gonly

User-agent: *
Disallow: /
    `.trim();
    const groups = parseRobotsTxt(body);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.userAgent).sort()).toEqual(['*', 'Googlebot']);
  });

  it('ignores comments and blank lines', () => {
    const body = `# this is a comment\n\nUser-agent: *\nDisallow: /foo # trailing\n`;
    const groups = parseRobotsTxt(body);
    expect(groups[0].disallow).toContain('/foo');
  });

  it('allows paths not matching any rule', () => {
    const groups = parseRobotsTxt('User-agent: *\nDisallow: /private\n');
    expect(isPathAllowed(groups, 'NetworkNavigator', '/public/page')).toBe(true);
  });

  it('blocks a disallowed prefix', () => {
    const groups = parseRobotsTxt('User-agent: *\nDisallow: /private\n');
    expect(isPathAllowed(groups, 'NetworkNavigator', '/private/secret')).toBe(
      false
    );
  });

  it('honors longest-match Allow over shorter Disallow', () => {
    const groups = parseRobotsTxt(
      'User-agent: *\nDisallow: /\nAllow: /public\n'
    );
    expect(isPathAllowed(groups, 'NetworkNavigator', '/public/x')).toBe(true);
    expect(isPathAllowed(groups, 'NetworkNavigator', '/other')).toBe(false);
  });

  it('prefers the exact UA group over wildcard', () => {
    const body = `
User-agent: *
Disallow: /

User-agent: NetworkNavigator
Allow: /ok
    `.trim();
    const groups = parseRobotsTxt(body);
    expect(isPathAllowed(groups, 'NetworkNavigator', '/ok')).toBe(true);
    // Any other path on the same UA has no rule → default allow.
    expect(isPathAllowed(groups, 'NetworkNavigator', '/other')).toBe(true);
  });

  it('defaults to allow when no rule group applies', () => {
    const groups = parseRobotsTxt('User-agent: OtherBot\nDisallow: /\n');
    expect(isPathAllowed(groups, 'NetworkNavigator', '/anything')).toBe(true);
  });

  it('treats empty input as allow-all', () => {
    const groups = parseRobotsTxt('');
    expect(groups).toHaveLength(0);
    expect(isPathAllowed(groups, 'NetworkNavigator', '/foo')).toBe(true);
  });
});
