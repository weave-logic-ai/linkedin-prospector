// Phase 3 Track G — Podcast connector unit tests.

import {
  parsePodcastFeed,
  parseDuration,
  extractGuestNames,
  flattenSubtitleText,
} from '@/lib/sources/connectors/podcast';

describe('Podcast connector — feed parsing', () => {
  const FEED_XML = `<?xml version="1.0" encoding="UTF-8"?>
    <rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
         xmlns:podcast="https://podcastindex.org/namespace/1.0">
      <channel>
        <title>Test Podcast</title>
        <item>
          <title>Episode 42: Jane Doe on the future of payments</title>
          <guid>ep-42-guid</guid>
          <pubDate>Tue, 15 Jan 2026 10:00:00 GMT</pubDate>
          <itunes:duration>1:23:45</itunes:duration>
          <podcast:transcript url="https://example.com/ep42.srt" type="application/x-subrip" />
          <itunes:summary>Jane Doe joins to discuss payments.</itunes:summary>
          <description>Jane Doe joins to discuss payments.</description>
        </item>
        <item>
          <title>Untitled Episode</title>
          <guid>ep-43-guid</guid>
          <pubDate>Wed, 16 Jan 2026 10:00:00 GMT</pubDate>
          <itunes:duration>3600</itunes:duration>
          <description>No transcript here.</description>
        </item>
      </channel>
    </rss>`;

  it('extracts channel + episodes', () => {
    const parsed = parsePodcastFeed(FEED_XML);
    expect(parsed.channelTitle).toBe('Test Podcast');
    expect(parsed.episodes.length).toBe(2);
  });

  it('captures transcript availability + URL + format', () => {
    const parsed = parsePodcastFeed(FEED_XML);
    const ep = parsed.episodes[0];
    expect(ep.transcriptAvailable).toBe(true);
    expect(ep.transcriptUrl).toBe('https://example.com/ep42.srt');
    expect(ep.transcriptFormat).toBe('srt');
  });

  it('falls back to itunes:summary when no transcript (priority)', () => {
    const parsed = parsePodcastFeed(FEED_XML);
    const ep = parsed.episodes[1];
    expect(ep.transcriptAvailable).toBe(false);
    expect(ep.summary).toBe('No transcript here.');
  });

  it('parses duration formats (HH:MM:SS and seconds)', () => {
    expect(parseDuration('1:23:45')).toBe(5025);
    expect(parseDuration('23:45')).toBe(1425);
    expect(parseDuration('3600')).toBe(3600);
    expect(parseDuration('')).toBe(null);
    expect(parseDuration('bogus')).toBe(null);
  });

  it('extracts guest names from episode titles', () => {
    const names = extractGuestNames(
      'Episode 42: Jane Doe on the future of payments',
      'A great discussion.'
    );
    expect(names).toContain('Jane Doe');
  });

  it('extracts guests from the summary "Guest:" marker', () => {
    const names = extractGuestNames(
      'Weekly roundup',
      'Guest: John Smith. We cover the state of the market.'
    );
    expect(names).toContain('John Smith');
  });

  it('emits ISO 8601 publishedAt', () => {
    const parsed = parsePodcastFeed(FEED_XML);
    expect(parsed.episodes[0].pubDate).toBe(
      new Date('Tue, 15 Jan 2026 10:00:00 GMT').toISOString()
    );
  });
});

describe('Podcast connector — transcript round-trip (SRT/VTT flattening)', () => {
  it('flattens SRT into plain text', () => {
    const srt = `1
00:00:01,000 --> 00:00:03,000
Hello, this is Jane.

2
00:00:03,500 --> 00:00:06,000
Thanks for having me on the show.`;
    const out = flattenSubtitleText(srt, 'srt');
    expect(out).toContain('Hello, this is Jane.');
    expect(out).toContain('Thanks for having me on the show.');
    expect(out).not.toContain('-->');
    expect(out).not.toMatch(/^\d+$/m);
  });

  it('flattens VTT into plain text', () => {
    const vtt = `WEBVTT

NOTE This is a comment

00:00:01.000 --> 00:00:03.000
Welcome to the show.

00:00:03.500 --> 00:00:05.000
Today we have Jane Doe.`;
    const out = flattenSubtitleText(vtt, 'vtt');
    expect(out).toContain('Welcome to the show.');
    expect(out).toContain('Today we have Jane Doe.');
    expect(out).not.toContain('WEBVTT');
    expect(out).not.toContain('-->');
  });

  it('plain-text transcripts pass through unchanged', () => {
    const plain = 'The interview covered many topics.';
    expect(flattenSubtitleText(plain, 'plain')).toBe(plain);
  });
});
