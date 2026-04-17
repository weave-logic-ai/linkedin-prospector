// LinkedIn-only enrichment contract tests.
//
// Per `.planning/research-tools-sprint/10-decisions.md` Q9 A+C, snippet-created
// contacts fire a scoped enrichment pass that calls ONLY the LinkedIn provider.
// These tests pin the contract by:
//   1. Asserting that when a contact has no `linkedinUrl`, no provider runs
//      and a skip reason is surfaced.
//   2. Asserting that the LinkedIn provider's `enrich()` is the only thing
//      invoked when a URL is present — the paid provider constructors
//      (PDL, Apollo, Lusha, TheirStack) are mocked to throw on instantiation
//      so any accidental call fails the test loudly.

import { enrichContactFromLinkedIn } from '@/lib/enrichment/linkedin-only';

jest.mock('@/lib/enrichment/providers/pdl', () => ({
  PdlProvider: class {
    constructor() {
      throw new Error('PdlProvider must NOT be constructed from linkedin-only');
    }
  },
}));
jest.mock('@/lib/enrichment/providers/apollo', () => ({
  ApolloProvider: class {
    constructor() {
      throw new Error('ApolloProvider must NOT be constructed from linkedin-only');
    }
  },
}));
jest.mock('@/lib/enrichment/providers/lusha', () => ({
  LushaProvider: class {
    constructor() {
      throw new Error('LushaProvider must NOT be constructed from linkedin-only');
    }
  },
}));
jest.mock('@/lib/enrichment/providers/theirstack', () => ({
  TheirStackProvider: class {
    constructor() {
      throw new Error('TheirStackProvider must NOT be constructed from linkedin-only');
    }
  },
}));

describe('enrichContactFromLinkedIn', () => {
  it('skips when contact has no linkedinUrl', async () => {
    const out = await enrichContactFromLinkedIn({
      id: 'c-1',
      linkedinUrl: '',
      firstName: 'Jane',
      lastName: 'Doe',
      fullName: 'Jane Doe',
      email: null,
      currentCompany: null,
      title: null,
    });
    expect(out.invoked).toBe(false);
    expect(out.result).toBeNull();
    expect(out.skipReason).toMatch(/no linkedin_url/);
  });

  it('invokes the LinkedIn provider when a URL is present', async () => {
    const enrich = jest.fn().mockResolvedValue({
      providerId: 'linkedin',
      providerName: 'LinkedIn (Extension)',
      success: true,
      fields: [],
      costCents: 0,
      rawResponse: { status: 'queued' },
    });
    const out = await enrichContactFromLinkedIn(
      {
        id: 'c-1',
        linkedinUrl: 'https://linkedin.com/in/jane',
        firstName: 'Jane',
        lastName: 'Doe',
        fullName: 'Jane Doe',
        email: null,
        currentCompany: null,
        title: null,
      },
      () => ({ enrich })
    );
    expect(out.invoked).toBe(true);
    expect(out.result?.providerId).toBe('linkedin');
    expect(enrich).toHaveBeenCalledTimes(1);
  });

  it('NEVER constructs paid providers (PDL, Apollo, Lusha, TheirStack)', async () => {
    // The mocked constructors throw if called. If any paid provider module is
    // accidentally wired into the helper, this `await` will reject.
    const enrich = jest.fn().mockResolvedValue({
      providerId: 'linkedin',
      providerName: 'LinkedIn (Extension)',
      success: true,
      fields: [],
      costCents: 0,
    });
    await expect(
      enrichContactFromLinkedIn(
        {
          id: 'c-1',
          linkedinUrl: 'https://linkedin.com/in/jane',
          firstName: 'Jane',
          lastName: 'Doe',
          fullName: 'Jane Doe',
          email: null,
          currentCompany: null,
          title: null,
        },
        () => ({ enrich })
      )
    ).resolves.toMatchObject({ invoked: true });
  });

  it('zero-cost contract: the provider invoked reports costCents=0', async () => {
    const enrich = jest.fn().mockResolvedValue({
      providerId: 'linkedin',
      providerName: 'LinkedIn (Extension)',
      success: true,
      fields: [],
      costCents: 0,
    });
    const out = await enrichContactFromLinkedIn(
      {
        id: 'c-1',
        linkedinUrl: 'https://linkedin.com/in/x',
        firstName: null,
        lastName: null,
        fullName: 'x',
        email: null,
        currentCompany: null,
        title: null,
      },
      () => ({ enrich })
    );
    expect(out.result?.costCents).toBe(0);
  });
});
