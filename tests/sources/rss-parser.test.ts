// RSS / Atom XML parser unit tests. These cover the structural parse path —
// the connector's DB / fetch layers are mocked in other tests.

import {
  parseXml,
  decodeEntities,
  normalizeRssItems,
} from '@/lib/sources/connectors/rss';

describe('decodeEntities', () => {
  it('decodes the five named XML entities', () => {
    expect(decodeEntities('&amp;&lt;&gt;&quot;&apos;')).toBe('&<>"\'');
  });

  it('decodes numeric decimal entities', () => {
    expect(decodeEntities('A&#65;B')).toBe('AAB');
  });

  it('decodes numeric hex entities', () => {
    expect(decodeEntities('&#x2014;')).toBe('\u2014'); // em-dash
  });

  it('leaves unknown entities intact (no external resolution)', () => {
    expect(decodeEntities('&ouml;')).toBe('&ouml;');
  });
});

describe('parseXml', () => {
  it('parses a minimal element with text', () => {
    const root = parseXml('<foo>hello</foo>');
    expect(root?.children[0]?.name).toBe('foo');
    expect(root?.children[0]?.text).toBe('hello');
  });

  it('parses attributes', () => {
    const root = parseXml('<a href="https://example.com" rel="self">hi</a>');
    expect(root?.children[0]?.attrs.href).toBe('https://example.com');
    expect(root?.children[0]?.attrs.rel).toBe('self');
  });

  it('handles CDATA sections', () => {
    const root = parseXml('<x><![CDATA[<b>raw</b> & stuff]]></x>');
    expect(root?.children[0]?.text).toContain('<b>raw</b>');
    expect(root?.children[0]?.text).toContain('& stuff');
  });

  it('drops comments, PIs, and DOCTYPE declarations', () => {
    const xml = `<?xml version="1.0"?><!DOCTYPE html><!-- drop --><root><kid/></root>`;
    const root = parseXml(xml);
    expect(root?.children[0]?.name).toBe('root');
    expect(root?.children[0]?.children[0]?.name).toBe('kid');
  });
});

describe('normalizeRssItems — RSS 2.0', () => {
  const rss = `<?xml version="1.0"?>
    <rss version="2.0">
      <channel>
        <title>Test Feed</title>
        <item>
          <title>Post One</title>
          <link>https://example.com/post-1</link>
          <description>Summary one</description>
          <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
          <guid>post-1-guid</guid>
          <category>news</category>
          <category>tech</category>
          <dc:creator>Jane Author</dc:creator>
        </item>
        <item>
          <title>Post Two</title>
          <link>https://example.com/post-2</link>
          <description>Summary two</description>
          <guid>post-2-guid</guid>
        </item>
      </channel>
    </rss>`;

  it('extracts items from the channel', () => {
    const tree = parseXml(rss);
    const items = normalizeRssItems(tree);
    expect(items).toHaveLength(2);
  });

  it('populates title, link, description, pubDate, guid, categories, author', () => {
    const tree = parseXml(rss);
    const [first] = normalizeRssItems(tree);
    expect(first.title).toBe('Post One');
    expect(first.link).toBe('https://example.com/post-1');
    expect(first.description).toBe('Summary one');
    expect(first.pubDate?.toISOString()).toBe('2024-01-01T12:00:00.000Z');
    expect(first.guid).toBe('post-1-guid');
    expect(first.categories).toEqual(['news', 'tech']);
    expect(first.authorName).toBe('Jane Author');
  });
});

describe('normalizeRssItems — Atom 1.0', () => {
  const atom = `<?xml version="1.0"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <title>Atom Example</title>
      <entry>
        <title>Atom Post</title>
        <link href="https://example.org/atom-post" rel="alternate"/>
        <id>urn:uuid:atom-1</id>
        <published>2024-02-15T08:30:00Z</published>
        <summary>An atom summary.</summary>
        <author><name>Bob Blogger</name></author>
        <category term="product" />
      </entry>
    </feed>`;

  it('extracts the href from Atom <link>', () => {
    const items = normalizeRssItems(parseXml(atom));
    expect(items).toHaveLength(1);
    expect(items[0].link).toBe('https://example.org/atom-post');
  });

  it('uses <published> as pubDate and <id> as guid', () => {
    const items = normalizeRssItems(parseXml(atom));
    expect(items[0].guid).toBe('urn:uuid:atom-1');
    expect(items[0].pubDate?.toISOString()).toBe('2024-02-15T08:30:00.000Z');
  });

  it('reads author from <author><name>', () => {
    const items = normalizeRssItems(parseXml(atom));
    expect(items[0].authorName).toBe('Bob Blogger');
  });

  it('picks the term attribute from <category>', () => {
    const items = normalizeRssItems(parseXml(atom));
    expect(items[0].categories).toEqual(['product']);
  });
});

describe('normalizeRssItems — edge cases', () => {
  it('returns [] on non-feed XML', () => {
    expect(normalizeRssItems(parseXml('<html><body/></html>'))).toEqual([]);
  });

  it('returns [] on empty channel', () => {
    const items = normalizeRssItems(
      parseXml('<rss><channel><title>Empty</title></channel></rss>')
    );
    expect(items).toEqual([]);
  });

  it('tolerates missing optional fields gracefully', () => {
    const xml = `<rss><channel>
      <item>
        <link>https://example.com/one</link>
      </item>
    </channel></rss>`;
    const items = normalizeRssItems(parseXml(xml));
    expect(items).toHaveLength(1);
    expect(items[0].title).toBeNull();
    expect(items[0].categories).toEqual([]);
  });
});
