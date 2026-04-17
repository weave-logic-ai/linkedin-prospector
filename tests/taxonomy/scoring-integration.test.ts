// Taxonomy + scoring integration:
// Verify the ICP→Niche→Industry chain enriches ICP criteria used in scoring.

jest.mock('@/lib/db/client', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  healthCheck: jest.fn(),
  getPool: jest.fn(),
  shutdown: jest.fn(),
}));

import { query } from '@/lib/db/client';
import { resolveTaxonomyChain } from '@/lib/taxonomy/service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function mockRows<T>(rows: T[]): ReturnType<typeof query> {
  return Promise.resolve({ rows, command: '', rowCount: rows.length, oid: 0, fields: [] }) as ReturnType<typeof query>;
}

describe('ICP→Niche→Industry taxonomy chain', () => {
  beforeEach(() => mockQuery.mockReset());

  it('resolves industry.name as derived industry for ICP criteria enrichment', async () => {
    mockQuery.mockReturnValueOnce(mockRows([{
      icp_id: 'icp-1', niche_id: 'niche-1', icp_name: 'CTOs at SaaS', icp_desc: null,
      is_active: true, criteria: { roles: ['CTO'] }, weight_overrides: {},
      icp_created: 'x', icp_updated: 'y',
      niche_id_val: 'niche-1', industry_id: 'ind-1', niche_name: 'SaaS', niche_desc: null,
      keywords: ['saas', 'subscription'], company_size_range: null, geo_focus: [], member_count: 10,
      affordability: null, fitability: null, buildability: null, niche_score: null,
      niche_created: 'x', niche_updated: 'y',
      i_id: 'ind-1', i_name: 'Technology', i_slug: 'technology', i_description: null,
      i_metadata: {}, i_created: 'x', i_updated: 'y',
    }]));

    const chain = await resolveTaxonomyChain('icp-1');
    expect(chain.industry?.name).toBe('Technology');
    expect(chain.niche?.keywords).toEqual(['saas', 'subscription']);

    // Simulate what the scoring pipeline does: merge chain data into ICP criteria.
    const baseCriteria = { roles: ['CTO'] as string[] };
    const enriched = {
      ...baseCriteria,
      ...(chain.industry ? { industries: [chain.industry.name] } : {}),
      ...(chain.niche?.keywords?.length ? { nicheKeywords: chain.niche.keywords } : {}),
    };

    expect(enriched.industries).toEqual(['Technology']);
    expect(enriched.nicheKeywords).toEqual(['saas', 'subscription']);
  });

  it('does not add industries field when chain lacks industry', async () => {
    mockQuery.mockReturnValueOnce(mockRows([{
      icp_id: 'icp-1', niche_id: null, icp_name: 'CTOs', icp_desc: null,
      is_active: true, criteria: {}, weight_overrides: {},
      icp_created: 'x', icp_updated: 'y',
      niche_id_val: null, industry_id: null, niche_name: null, niche_desc: null,
      keywords: null, company_size_range: null, geo_focus: null, member_count: null,
      affordability: null, fitability: null, buildability: null, niche_score: null,
      niche_created: null, niche_updated: null,
      i_id: null, i_name: null, i_slug: null, i_description: null,
      i_metadata: null, i_created: null, i_updated: null,
    }]));

    const chain = await resolveTaxonomyChain('icp-1');
    expect(chain.industry).toBeNull();
    expect(chain.niche).toBeNull();

    const baseCriteria = { roles: ['CTO'] as string[] };
    const enriched = {
      ...baseCriteria,
      ...(chain.industry ? { industries: [(chain.industry as { name: string }).name] } : {}),
      ...(chain.niche?.keywords?.length ? { nicheKeywords: chain.niche.keywords } : {}),
    };

    expect('industries' in enriched).toBe(false);
    expect('nicheKeywords' in enriched).toBe(false);
  });

  it('skips niche keywords when array is empty', async () => {
    mockQuery.mockReturnValueOnce(mockRows([{
      icp_id: 'icp-1', niche_id: 'niche-1', icp_name: 'CTOs', icp_desc: null,
      is_active: true, criteria: {}, weight_overrides: {},
      icp_created: 'x', icp_updated: 'y',
      niche_id_val: 'niche-1', industry_id: 'ind-1', niche_name: 'SaaS', niche_desc: null,
      keywords: [], company_size_range: null, geo_focus: [], member_count: 10,
      affordability: null, fitability: null, buildability: null, niche_score: null,
      niche_created: 'x', niche_updated: 'y',
      i_id: 'ind-1', i_name: 'Technology', i_slug: 'technology', i_description: null,
      i_metadata: {}, i_created: 'x', i_updated: 'y',
    }]));

    const chain = await resolveTaxonomyChain('icp-1');
    const baseCriteria = {};
    const enriched: Record<string, unknown> = {
      ...baseCriteria,
      ...(chain.industry ? { industries: [chain.industry.name] } : {}),
      ...(chain.niche?.keywords?.length ? { nicheKeywords: chain.niche.keywords } : {}),
    };

    expect(enriched.industries).toEqual(['Technology']);
    expect('nicheKeywords' in enriched).toBe(false);
  });
});
