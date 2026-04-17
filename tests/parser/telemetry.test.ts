// Parser telemetry — flag-gating and best-effort-write behaviour.
// Per `01-parser-audit.md` §4.2 and ADR-031 (retention).

// cheerio is accessed via a tiny lib helper at @/lib/parser/_test-helpers so
// jest resolves it via the @/ mapper (test file lives outside app/, so a
// bare `cheerio` import would need moduleDirectories tweaks we prefer to
// avoid).
import { loadHtmlForTests } from '@/lib/parser/_test-helpers';
import { findUnmatchedDom } from '@/lib/parser/unmatched-dom';
import {
  registerFallback,
  runFallbacks,
  _clearFallbackRegistryForTests,
} from '@/lib/parser/fallbacks/registry';

describe('parser telemetry flag-gating', () => {
  const PREV_FLAG = process.env.RESEARCH_PARSER_TELEMETRY;

  afterEach(() => {
    process.env.RESEARCH_PARSER_TELEMETRY = PREV_FLAG;
    jest.resetModules();
  });

  it('recordFieldOutcomes is a no-op when the flag is off', async () => {
    process.env.RESEARCH_PARSER_TELEMETRY = 'false';
    jest.resetModules();
    const mod = await import('@/lib/parser/telemetry');
    const res = await mod.recordFieldOutcomes({
      captureId: 'cap-1',
      pageType: 'PROFILE',
      parserVersion: '2.0.0',
      selectorConfigVersion: 1,
      fields: [
        {
          field: 'name',
          value: 'Redacted Name',
          confidence: 0.9,
          source: 'selector',
          selectorUsed: 'h1',
        },
      ],
    });
    expect(res.attempted).toBe(false);
    expect(res.rowsWritten).toBe(0);
    expect(res.reason).toBe('flag-off');
  });

  it('recordFieldOutcomes returns "no-fields" when given an empty list', async () => {
    process.env.RESEARCH_PARSER_TELEMETRY = 'true';
    jest.resetModules();
    const mod = await import('@/lib/parser/telemetry');
    const res = await mod.recordFieldOutcomes({
      captureId: 'cap-1',
      pageType: 'PROFILE',
      parserVersion: '2.0.0',
      selectorConfigVersion: 1,
      fields: [],
    });
    expect(res.attempted).toBe(false);
    expect(res.rowsWritten).toBe(0);
    expect(res.reason).toBe('no-fields');
  });

  it('readYieldReport returns null when the flag is off', async () => {
    process.env.RESEARCH_PARSER_TELEMETRY = 'false';
    jest.resetModules();
    const mod = await import('@/lib/parser/telemetry');
    const rows = await mod.readYieldReport();
    expect(rows).toBeNull();
  });
});

describe('unmatched-dom walker', () => {
  it('finds substantive non-matched sections and emits a DOM path', () => {
    const html = `
      <main>
        <section class="consumed">
          <h1 id="h1">Consumed heading</h1>
        </section>
        <section aria-labelledby="orphan" class="orphan-section">
          <h2 id="orphan">Orphan heading</h2>
          <p>This DOM region is large enough to register as unmatched and carries 80+ chars of text content.</p>
        </section>
      </main>
    `;
    const $ = loadHtmlForTests(html);
    const results = findUnmatchedDom($, [
      {
        field: 'name',
        value: 'x',
        confidence: 1,
        source: 'selector',
        selectorUsed: 'section.consumed',
      },
    ]);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].domPath).toContain('section');
    expect(results[0].textPreview).toContain('Orphan heading');
  });

  it('never emits a matched section', () => {
    const html = `<main><section class="all-matched"><p>Large enough text content here to pass the 80-character threshold easily easily easily.</p></section></main>`;
    const $ = loadHtmlForTests(html);
    const results = findUnmatchedDom($, [
      {
        field: 'x',
        value: 'v',
        confidence: 1,
        source: 'selector',
        selectorUsed: 'section.all-matched',
      },
    ]);
    expect(results.length).toBe(0);
  });
});

describe('fallback registry', () => {
  it('skips fields already filled by primary extraction', () => {
    _clearFallbackRegistryForTests();
    registerFallback({
      name: 'sentinel',
      pageTypes: ['PROFILE'],
      apply: () => [
        {
          field: 'name',
          value: 'FromFallback',
          confidence: 0.4,
          source: 'fallback',
          selectorUsed: 'fallback:sentinel',
        },
      ],
    });

    const $ = loadHtmlForTests('<html><head><title>t</title></head><body></body></html>');
    const result = runFallbacks('PROFILE', $, 'https://example.invalid/', new Set(['name']));
    expect(result.find((f) => f.field === 'name')).toBeUndefined();

    const result2 = runFallbacks('PROFILE', $, 'https://example.invalid/', new Set());
    expect(result2.find((f) => f.field === 'name')?.value).toBe('FromFallback');

    _clearFallbackRegistryForTests();
  });
});
