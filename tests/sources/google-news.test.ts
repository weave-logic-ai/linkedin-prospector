// Google News connector — query URL construction + enablement gate.
// The fetch path is mocked away in the cron-route tests.

import {
  buildGoogleNewsQuery,
  isGoogleNewsConnectorEnabled,
} from '@/lib/sources/connectors/google-news';

describe('buildGoogleNewsQuery', () => {
  it('wraps the target name in double quotes and encodes the query', () => {
    const url = buildGoogleNewsQuery('Acme Robotics');
    expect(url).toBe(
      'https://news.google.com/rss/search?q=%22Acme%20Robotics%22&hl=en-US&gl=US'
    );
  });

  it('defaults hl=en-US and gl=US when unspecified', () => {
    const url = buildGoogleNewsQuery('Jane Doe');
    expect(url).toContain('hl=en-US');
    expect(url).toContain('gl=US');
  });

  it('allows overriding hl/gl', () => {
    const url = buildGoogleNewsQuery('Sony', 'ja', 'JP');
    expect(url).toContain('hl=ja');
    expect(url).toContain('gl=JP');
  });

  it('percent-encodes quote characters so the URL is safe to concat', () => {
    const url = buildGoogleNewsQuery('OpenAI');
    expect(url).toContain('%22OpenAI%22');
  });

  it('throws on empty target name', () => {
    expect(() => buildGoogleNewsQuery('')).toThrow();
    expect(() => buildGoogleNewsQuery('   ')).toThrow();
  });

  it('escapes non-ASCII characters in a multi-word target', () => {
    const url = buildGoogleNewsQuery("L'Oréal USA");
    expect(url).toContain('%22');
    expect(url).toContain('%C3%A9'); // é
    expect(url).toContain('%20USA%22'); // " USA"
  });
});

describe('isGoogleNewsConnectorEnabled', () => {
  const PREV = process.env.RESEARCH_CONNECTOR_GOOGLE_NEWS;
  afterEach(() => {
    process.env.RESEARCH_CONNECTOR_GOOGLE_NEWS = PREV;
  });

  it('returns false when env flag is absent', () => {
    delete process.env.RESEARCH_CONNECTOR_GOOGLE_NEWS;
    expect(isGoogleNewsConnectorEnabled()).toBe(false);
  });

  it('returns true only when flag is exactly "true"', () => {
    process.env.RESEARCH_CONNECTOR_GOOGLE_NEWS = 'true';
    expect(isGoogleNewsConnectorEnabled()).toBe(true);
    process.env.RESEARCH_CONNECTOR_GOOGLE_NEWS = 'TRUE';
    expect(isGoogleNewsConnectorEnabled()).toBe(false);
    process.env.RESEARCH_CONNECTOR_GOOGLE_NEWS = '1';
    expect(isGoogleNewsConnectorEnabled()).toBe(false);
  });
});
