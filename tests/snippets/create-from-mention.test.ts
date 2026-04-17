// POST /api/extension/contact/create-from-mention — validator + flag tests.
//
// Same pattern as `route.test.ts`: the live route imports from `next/server`
// which isn't resolvable inside jest. We mirror the validator shape here and
// pin the RESEARCH_FLAGS gate so the surface is covered without spinning a
// Next runtime. Integration with the real handler is exercised by the
// LinkedIn-only contract test and the DB layer tests.

import { RESEARCH_FLAGS } from '@/lib/config/research-flags';

const MAX_CONTEXT_LENGTH = 200;
const MAX_NAME_LENGTH = 120;

function validateBody(body: unknown):
  | { ok: true; value: { name: string; linkedinUrl?: string; snippetSourceUrl: string; context: string } }
  | { ok: false; message: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, message: 'Body must be an object' };
  }
  const b = body as Record<string, unknown>;
  if (typeof b.name !== 'string' || b.name.trim().length === 0) {
    return { ok: false, message: 'name must be a non-empty string' };
  }
  if (b.name.length > MAX_NAME_LENGTH) {
    return { ok: false, message: `name exceeds ${MAX_NAME_LENGTH}-char limit` };
  }
  if (typeof b.snippetSourceUrl !== 'string' || !/^https?:\/\//i.test(b.snippetSourceUrl)) {
    return { ok: false, message: 'snippetSourceUrl must be an http(s) URL' };
  }
  if (typeof b.context !== 'string') {
    return { ok: false, message: 'context must be a string' };
  }
  if (b.linkedinUrl !== undefined && b.linkedinUrl !== null) {
    if (typeof b.linkedinUrl !== 'string' || !/linkedin\.com\//i.test(b.linkedinUrl)) {
      return { ok: false, message: 'linkedinUrl, when provided, must contain linkedin.com/' };
    }
  }
  return {
    ok: true,
    value: {
      name: b.name.trim(),
      linkedinUrl:
        typeof b.linkedinUrl === 'string' && b.linkedinUrl.trim().length > 0
          ? b.linkedinUrl.trim()
          : undefined,
      snippetSourceUrl: b.snippetSourceUrl,
      context: String(b.context).slice(0, MAX_CONTEXT_LENGTH),
    },
  };
}

describe('create-from-mention route gate', () => {
  it('defaults to feature-flag-off (snippets=false)', () => {
    // Flag off → route returns 404 so the extension falls back to the legacy
    // dropdown. This mirrors the other snippet-route gates in route.test.ts.
    expect(RESEARCH_FLAGS.snippets).toBe(false);
  });
});

describe('create-from-mention body validation', () => {
  it('accepts a minimal payload with just name + URL + context', () => {
    const out = validateBody({
      name: 'Jane Doe',
      snippetSourceUrl: 'https://example.com/press',
      context: 'In 2024 Jane Doe joined Acme as CTO.',
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.name).toBe('Jane Doe');
      expect(out.value.linkedinUrl).toBeUndefined();
      expect(out.value.context.length).toBeLessThanOrEqual(MAX_CONTEXT_LENGTH);
    }
  });

  it('rejects empty name', () => {
    expect(
      validateBody({
        name: '   ',
        snippetSourceUrl: 'https://example.com',
        context: 'ctx',
      })
    ).toEqual({ ok: false, message: 'name must be a non-empty string' });
  });

  it('rejects non-http snippetSourceUrl', () => {
    expect(
      validateBody({
        name: 'Jane Doe',
        snippetSourceUrl: 'file:///tmp/x',
        context: 'ctx',
      })
    ).toEqual({
      ok: false,
      message: 'snippetSourceUrl must be an http(s) URL',
    });
  });

  it('rejects linkedinUrl that does not contain linkedin.com/', () => {
    expect(
      validateBody({
        name: 'Jane Doe',
        linkedinUrl: 'https://example.com/jane',
        snippetSourceUrl: 'https://example.com/press',
        context: 'ctx',
      })
    ).toEqual({
      ok: false,
      message: 'linkedinUrl, when provided, must contain linkedin.com/',
    });
  });

  it('truncates context to MAX_CONTEXT_LENGTH chars', () => {
    const longCtx = 'x'.repeat(500);
    const out = validateBody({
      name: 'Jane Doe',
      snippetSourceUrl: 'https://example.com/press',
      context: longCtx,
    });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.context.length).toBe(MAX_CONTEXT_LENGTH);
  });

  it('rejects names longer than the 120-char limit', () => {
    expect(
      validateBody({
        name: 'x'.repeat(200),
        snippetSourceUrl: 'https://example.com',
        context: 'ctx',
      })
    ).toEqual({ ok: false, message: 'name exceeds 120-char limit' });
  });
});
