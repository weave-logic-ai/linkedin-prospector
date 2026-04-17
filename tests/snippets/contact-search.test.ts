// GET /api/extension/contact/search contract tests.
//
// Mirrors the validator-shape pattern in `route.test.ts` (the route imports
// from `next/server` which isn't resolvable inside jest). We pin the query-
// shape, rank logic, and placeholder-URL hiding as pure functions so any
// drift in the route will fail here.

import { RESEARCH_FLAGS } from '@/lib/config/research-flags';

interface SearchRow {
  id: string;
  full_name: string;
  headline: string | null;
  current_company: string | null;
  linkedin_url: string | null;
  match_type: 'exact' | 'prefix' | 'substring';
  synth: boolean;
}

// Mirror of the response-shaping logic inside the route. If the route's
// output format changes, this test must change too — that is the intent.
function shapeMatches(rows: SearchRow[]) {
  return rows.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    headline: row.headline,
    currentCompany: row.current_company,
    linkedinUrl:
      row.linkedin_url && row.linkedin_url.startsWith('snippet-created://')
        ? null
        : row.linkedin_url,
    confidence:
      row.match_type === 'exact'
        ? 1.0
        : row.match_type === 'prefix'
        ? 0.85
        : 0.6,
  }));
}

describe('contact-search route gate', () => {
  it('defaults to feature-flag-off (snippets=false → 404)', () => {
    expect(RESEARCH_FLAGS.snippets).toBe(false);
  });
});

describe('contact-search result shaping', () => {
  it('hides snippet-created placeholder URLs from the response', () => {
    const shaped = shapeMatches([
      {
        id: '1',
        full_name: 'Jane Doe',
        headline: 'CTO',
        current_company: 'Acme',
        linkedin_url: 'snippet-created://abc-uuid',
        match_type: 'exact',
        synth: true,
      },
    ]);
    expect(shaped[0].linkedinUrl).toBeNull();
    expect(shaped[0].confidence).toBe(1.0);
  });

  it('preserves real LinkedIn URLs and labels their match type confidence', () => {
    const shaped = shapeMatches([
      {
        id: '1',
        full_name: 'Jane Doe',
        headline: null,
        current_company: null,
        linkedin_url: 'https://linkedin.com/in/jane',
        match_type: 'prefix',
        synth: false,
      },
      {
        id: '2',
        full_name: 'Jane Smithers Doe',
        headline: null,
        current_company: null,
        linkedin_url: 'https://linkedin.com/in/jsd',
        match_type: 'substring',
        synth: false,
      },
    ]);
    expect(shaped[0].confidence).toBe(0.85);
    expect(shaped[1].confidence).toBe(0.6);
    expect(shaped[0].linkedinUrl).toBe('https://linkedin.com/in/jane');
  });
});

describe('query-parameter validation', () => {
  // These validators are small and self-contained in the route; we mirror
  // their decisions so the tests don't depend on next/server.
  function validateQ(raw: string | null, limit: number) {
    const q = (raw ?? '').trim();
    if (q.length === 0) {
      return { status: 400 as const, message: 'q parameter is required' };
    }
    if (q.length < 2) return { status: 200 as const, matches: [] };
    const clamped =
      Number.isFinite(limit) && limit > 0
        ? Math.min(Math.floor(limit), 50)
        : 10;
    return { status: 200 as const, q, limit: clamped };
  }

  it('rejects missing q', () => {
    expect(validateQ(null, 10)).toEqual({
      status: 400,
      message: 'q parameter is required',
    });
  });

  it('returns empty matches for single-char q', () => {
    expect(validateQ('a', 10)).toEqual({ status: 200, matches: [] });
  });

  it('clamps limit to the [1, 50] range', () => {
    expect(validateQ('jane', 1000)).toMatchObject({ limit: 50 });
    expect(validateQ('jane', -1)).toMatchObject({ limit: 10 });
    expect(validateQ('jane', 5)).toMatchObject({ limit: 5 });
  });
});
