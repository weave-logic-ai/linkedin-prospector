// Tests for taxonomy service: Industry/Vertical CRUD + hierarchy queries

jest.mock('@/lib/db/client', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  healthCheck: jest.fn(),
  getPool: jest.fn(),
  shutdown: jest.fn(),
}));

import { query } from '@/lib/db/client';
import * as taxonomyService from '@/lib/taxonomy/service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function mockRows<T>(rows: T[]): ReturnType<typeof query> {
  return Promise.resolve({ rows, command: '', rowCount: rows.length, oid: 0, fields: [] }) as ReturnType<typeof query>;
}

describe('Taxonomy service', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('listIndustries', () => {
    it('returns mapped industry rows ordered by name', async () => {
      mockQuery.mockReturnValueOnce(mockRows([
        {
          id: 'ind-1', name: 'Technology', slug: 'technology',
          description: 'Tech', metadata: {}, created_at: '2026-01-01', updated_at: '2026-01-02',
        },
        {
          id: 'ind-2', name: 'Healthcare', slug: 'healthcare',
          description: null, metadata: { emoji: 'health' }, created_at: '2026-01-01', updated_at: '2026-01-02',
        },
      ]));

      const result = await taxonomyService.listIndustries();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('ind-1');
      expect(result[0].name).toBe('Technology');
      expect(result[1].metadata).toEqual({ emoji: 'health' });
      expect(mockQuery.mock.calls[0][0]).toMatch(/ORDER BY name/);
    });
  });

  describe('getIndustry', () => {
    it('returns null for missing industry', async () => {
      mockQuery.mockReturnValueOnce(mockRows([]));
      const result = await taxonomyService.getIndustry('missing');
      expect(result).toBeNull();
    });

    it('returns mapped row when found', async () => {
      mockQuery.mockReturnValueOnce(mockRows([
        { id: 'ind-1', name: 'Tech', slug: 'tech', description: null, metadata: {}, created_at: 'x', updated_at: 'y' },
      ]));
      const result = await taxonomyService.getIndustry('ind-1');
      expect(result?.id).toBe('ind-1');
      expect(result?.slug).toBe('tech');
    });
  });

  describe('createIndustry', () => {
    it('generates slug from name and inserts', async () => {
      mockQuery.mockReturnValueOnce(mockRows([
        { id: 'new-id', name: 'Enterprise Software', slug: 'enterprise-software', description: 'd', metadata: {}, created_at: 'x', updated_at: 'y' },
      ]));

      const result = await taxonomyService.createIndustry({ name: 'Enterprise Software' });
      expect(result.slug).toBe('enterprise-software');
      // Verify slug passed as INSERT param
      const sqlParams = mockQuery.mock.calls[0][1] as unknown[];
      expect(sqlParams[0]).toBe('Enterprise Software');
      expect(sqlParams[1]).toBe('enterprise-software');
    });

    it('strips special characters when generating slug', async () => {
      mockQuery.mockReturnValueOnce(mockRows([
        { id: 'n', name: 'AI / ML !!!', slug: 'ai-ml', description: null, metadata: {}, created_at: 'x', updated_at: 'y' },
      ]));

      await taxonomyService.createIndustry({ name: 'AI / ML !!!' });
      const sqlParams = mockQuery.mock.calls[0][1] as unknown[];
      expect(sqlParams[1]).toBe('ai-ml');
    });
  });

  describe('updateIndustry', () => {
    it('returns null when no updates are provided', async () => {
      const result = await taxonomyService.updateIndustry('ind-1', {});
      expect(result).toBeNull();
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('updates name and slug together', async () => {
      mockQuery.mockReturnValueOnce(mockRows([
        { id: 'ind-1', name: 'New Name', slug: 'new-name', description: null, metadata: {}, created_at: 'x', updated_at: 'y' },
      ]));
      const result = await taxonomyService.updateIndustry('ind-1', { name: 'New Name' });
      expect(result?.name).toBe('New Name');
      expect(result?.slug).toBe('new-name');
    });
  });

  describe('deleteIndustry', () => {
    it('returns true when row is deleted', async () => {
      mockQuery.mockReturnValueOnce(mockRows([{ id: 'ind-1' }]));
      const result = await taxonomyService.deleteIndustry('ind-1');
      expect(result).toBe(true);
    });

    it('returns false when row does not exist', async () => {
      mockQuery.mockReturnValueOnce(mockRows([]));
      const result = await taxonomyService.deleteIndustry('missing');
      expect(result).toBe(false);
    });
  });

  describe('getIndustryWithNiches', () => {
    it('returns null when industry missing', async () => {
      mockQuery.mockReturnValueOnce(mockRows([])); // getIndustry
      const result = await taxonomyService.getIndustryWithNiches('missing');
      expect(result).toBeNull();
    });

    it('returns industry with niches and niche count', async () => {
      mockQuery.mockReturnValueOnce(mockRows([
        { id: 'ind-1', name: 'Tech', slug: 'tech', description: null, metadata: {}, created_at: 'x', updated_at: 'y' },
      ]));
      mockQuery.mockReturnValueOnce(mockRows([
        {
          id: 'niche-1', industry_id: 'ind-1', name: 'SaaS', description: null, keywords: ['saas'],
          company_size_range: null, geo_focus: [], member_count: 5, affordability: null, fitability: null,
          buildability: null, niche_score: null, created_at: 'x', updated_at: 'y',
        },
      ]));

      const result = await taxonomyService.getIndustryWithNiches('ind-1');
      expect(result?.nicheCount).toBe(1);
      expect(result?.niches[0].name).toBe('SaaS');
      expect(result?.niches[0].keywords).toEqual(['saas']);
    });
  });

  describe('resolveTaxonomyChain', () => {
    it('returns empty chain when ICP missing', async () => {
      mockQuery.mockReturnValueOnce(mockRows([]));
      const result = await taxonomyService.resolveTaxonomyChain('missing');
      expect(result).toEqual({ industry: null, niche: null, icp: null });
    });

    it('returns full chain when ICP linked to niche and industry', async () => {
      mockQuery.mockReturnValueOnce(mockRows([{
        icp_id: 'icp-1', niche_id: 'niche-1', icp_name: 'CTOs', icp_desc: null,
        is_active: true, criteria: { roles: ['CTO'] }, weight_overrides: {},
        icp_created: 'x', icp_updated: 'y',
        niche_id_val: 'niche-1', industry_id: 'ind-1', niche_name: 'SaaS', niche_desc: null,
        keywords: ['saas'], company_size_range: null, geo_focus: [], member_count: 10,
        affordability: null, fitability: null, buildability: null, niche_score: null,
        niche_created: 'x', niche_updated: 'y',
        i_id: 'ind-1', i_name: 'Technology', i_slug: 'technology', i_description: null,
        i_metadata: {}, i_created: 'x', i_updated: 'y',
      }]));

      const result = await taxonomyService.resolveTaxonomyChain('icp-1');
      expect(result.icp?.id).toBe('icp-1');
      expect(result.niche?.id).toBe('niche-1');
      expect(result.industry?.id).toBe('ind-1');
      expect(result.industry?.name).toBe('Technology');
    });

    it('returns icp only when niche link is null', async () => {
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

      const result = await taxonomyService.resolveTaxonomyChain('icp-1');
      expect(result.icp?.id).toBe('icp-1');
      expect(result.niche).toBeNull();
      expect(result.industry).toBeNull();
    });
  });

  describe('backward-compat aliases', () => {
    it('exposes listVerticals alias', () => {
      expect(taxonomyService.listVerticals).toBe(taxonomyService.listIndustries);
      expect(taxonomyService.createVertical).toBe(taxonomyService.createIndustry);
      expect(taxonomyService.updateVertical).toBe(taxonomyService.updateIndustry);
      expect(taxonomyService.deleteVertical).toBe(taxonomyService.deleteIndustry);
      expect(taxonomyService.getVerticalWithNiches).toBe(taxonomyService.getIndustryWithNiches);
    });
  });
});
