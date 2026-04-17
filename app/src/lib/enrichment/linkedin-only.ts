// LinkedIn-only enrichment helper — Q9 A+C scope.
//
// Per `.planning/research-tools-sprint/10-decisions.md` Q9, snippet-created
// contacts with a LinkedIn URL get an immediate, scoped enrichment pass:
//   - Only the LinkedIn scrape path runs (the `linkedin` provider).
//   - No paid providers (PDL, Apollo, Lusha, TheirStack) fire.
//   - If no LinkedIn URL is present, nothing runs.
//
// The normal waterfall in `waterfall.ts` picks providers by priority. This
// helper deliberately bypasses that module so no amount of provider-ordering
// drift could accidentally call a paid API from the snippet flow. Tests in
// `tests/enrichment/linkedin-only.test.ts` assert the contract (no paid
// provider constructors are invoked).
//
// Returned result is the single LinkedinProvider result (or a skip-sentinel
// when no URL). Callers that want the full waterfall for a contact can run
// `enrichContact()` later — this helper never gates that path.

import { LinkedinProvider } from './providers/linkedin';
import type { EnrichmentContact, EnrichmentResult } from './types';

export interface LinkedInOnlyResult {
  /** True when the LinkedIn provider was invoked. */
  invoked: boolean;
  /** Provider result when invoked, else null. */
  result: EnrichmentResult | null;
  /** Free-form reason skips happened (e.g. "no linkedin_url"). */
  skipReason?: string;
}

/**
 * Run LinkedIn-only enrichment against a contact. The implementation is
 * intentionally small: one provider, no budget check, no DB transaction log
 * (because the provider costs $0 and the waterfall's transaction ledger is
 * keyed to the budget flow).
 *
 * `providerFactory` is injected so tests can assert the exact provider class
 * used and can guarantee no paid constructor ever fires.
 */
export async function enrichContactFromLinkedIn(
  contact: EnrichmentContact,
  providerFactory: () => { enrich: (c: EnrichmentContact) => Promise<EnrichmentResult> } = () =>
    new LinkedinProvider()
): Promise<LinkedInOnlyResult> {
  if (!contact.linkedinUrl || contact.linkedinUrl.trim().length === 0) {
    return {
      invoked: false,
      result: null,
      skipReason: 'no linkedin_url on contact',
    };
  }

  const provider = providerFactory();
  const result = await provider.enrich(contact);
  return { invoked: true, result };
}
