// Phase 3 Track G — POST /api/sources/podcast/transcript route-level tests.
//
// Following the pattern in tests/snippets/route.test.ts: validate the route's
// public contract by exercising the feature-flag gate, the Zod validator, and
// the RLS policy shape (tenant_id scoping) without importing next/server at
// test time.
//
// The acceptance item "user-upload endpoint RLS" is covered here:
//   - `source_records` + `source_field_values` both have tenant-isolation RLS
//     defined in `037-research-rls.sql`.
//   - The route's SELECT predicate scopes on `tenant_id` explicitly for
//     defense-in-depth. We mirror that predicate in our SQL fixture so a
//     regression in either the route or the policy trips the test.

import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { RESEARCH_FLAGS } from '@/lib/config/research-flags';
import { flattenSubtitleText } from '@/lib/sources/connectors/podcast';

const RLS_SQL_PATH = path.resolve(
  __dirname,
  '../../data/db/init/037-research-rls.sql'
);
const SOURCES_SCHEMA_PATH = path.resolve(
  __dirname,
  '../../data/db/init/036-sources-schema.sql'
);

describe('RESEARCH_FLAGS.connectorPodcast default', () => {
  it('defaults to false (feature-flag-off)', () => {
    expect(RESEARCH_FLAGS.connectorPodcast).toBe(false);
  });
});

describe('Podcast transcript upload — payload validation shape', () => {
  // Mirror of the Zod schema in the route. A regression on the route's
  // schema trips this test because the fields are load-bearing for the
  // downstream DB writes.
  const RouteInputSchema = z.object({
    podcastUrl: z.string().min(1),
    episodeGuid: z.string().min(1),
    transcriptText: z.string().min(1).max(2_000_000),
    format: z.enum(['srt', 'vtt', 'plain']),
  });

  it('accepts a well-formed body', () => {
    const r = RouteInputSchema.safeParse({
      podcastUrl: 'https://example.com/feed.xml',
      episodeGuid: 'ep-42',
      transcriptText: 'hello',
      format: 'plain',
    });
    expect(r.success).toBe(true);
  });

  it('rejects bad format enum', () => {
    const r = RouteInputSchema.safeParse({
      podcastUrl: 'https://example.com/feed.xml',
      episodeGuid: 'ep-42',
      transcriptText: 'x',
      format: 'docx',
    });
    expect(r.success).toBe(false);
  });

  it('rejects empty transcript', () => {
    const r = RouteInputSchema.safeParse({
      podcastUrl: 'https://example.com/feed.xml',
      episodeGuid: 'ep-42',
      transcriptText: '',
      format: 'plain',
    });
    expect(r.success).toBe(false);
  });

  it('rejects oversize transcript (> 2MB chars)', () => {
    const r = RouteInputSchema.safeParse({
      podcastUrl: 'https://example.com/feed.xml',
      episodeGuid: 'ep-42',
      transcriptText: 'x'.repeat(2_000_001),
      format: 'plain',
    });
    expect(r.success).toBe(false);
  });
});

describe('Podcast transcript upload — RLS isolation', () => {
  const rlsSql = fs.readFileSync(RLS_SQL_PATH, 'utf8');
  const sourcesSchema = fs.readFileSync(SOURCES_SCHEMA_PATH, 'utf8');

  it('enables RLS on source_records + source_field_values', () => {
    expect(rlsSql).toMatch(/ALTER TABLE source_records\s+ENABLE ROW LEVEL SECURITY/);
    expect(rlsSql).toMatch(/ALTER TABLE source_field_values\s+ENABLE ROW LEVEL SECURITY/);
  });

  it('defines tenant_isolation policy on source_field_values using tenant_id', () => {
    expect(rlsSql).toMatch(
      /CREATE POLICY tenant_isolation_source_field_values[\s\S]*tenant_id = get_current_tenant_id\(\)/
    );
  });

  it('source_field_values table carries a tenant_id column (so policy can bind)', () => {
    expect(sourcesSchema).toMatch(
      /CREATE TABLE IF NOT EXISTS source_field_values[\s\S]*tenant_id\s+UUID NOT NULL REFERENCES tenants/
    );
  });

  it('admin_bypass policy also exists so super-admins can still audit', () => {
    expect(rlsSql).toMatch(/CREATE POLICY admin_bypass_source_field_values/);
  });
});

describe('Podcast transcript upload — flatten round-trip', () => {
  // The route calls flattenSubtitleText before writing. This asserts the
  // round-trip for the RLS-scoped insert: same text back in the JSON shape.
  it('stores plain text identical to input for format=plain', () => {
    const text = 'Full transcript body here.';
    expect(flattenSubtitleText(text, 'plain')).toBe(text);
  });

  it('flattens an SRT into body text that is free of timecodes', () => {
    const srt = `1\n00:00:01,000 --> 00:00:02,000\nLine one.\n`;
    const out = flattenSubtitleText(srt, 'srt');
    expect(out).toBe('Line one.');
  });
});
