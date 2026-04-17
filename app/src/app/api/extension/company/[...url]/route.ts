// GET /api/extension/company/:url
// Lookup company by LinkedIn company URL.
// URL passed as catch-all: /api/extension/company/https/www.linkedin.com/company/acme

import { NextRequest, NextResponse } from 'next/server';
import { withExtensionAuth } from '@/lib/middleware/extension-auth-middleware';
import { query } from '@/lib/db/client';

function normalizeLinkedInUrl(urlParts: string[]): string {
  let url = urlParts.join('/');
  if (!url.startsWith('http')) url = 'https://' + url;
  try {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return url;
  }
}

function extractCompanySlug(url: string): string | null {
  const m = url.match(/linkedin\.com\/company\/([^/?#]+)/i);
  return m ? m[1].toLowerCase() : null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ url: string[] }> },
) {
  return withExtensionAuth(req, async (_authReq, _extensionId) => {
    try {
      const { url: urlParts } = await params;
      if (!urlParts || urlParts.length === 0) {
        return NextResponse.json(
          { error: 'VALIDATION_ERROR', message: 'URL parameter is required' },
          { status: 400 },
        );
      }
      const normalizedUrl = normalizeLinkedInUrl(urlParts);
      const slug = extractCompanySlug(normalizedUrl);

      const result = await query<{
        id: string;
        name: string;
        slug: string;
        domain: string | null;
        industry: string | null;
        size_range: string | null;
        linkedin_url: string | null;
        headquarters: string | null;
        employee_count: number | null;
        description: string | null;
      }>(
        `SELECT id, name, slug, domain, industry, size_range, linkedin_url,
                headquarters, employee_count, description
         FROM companies
         WHERE ($1::text IS NOT NULL AND slug = $1)
            OR linkedin_url LIKE $2
         LIMIT 1`,
        [slug, `%${normalizedUrl.replace(/^https?:\/\//, '')}%`],
      );

      if (result.rows.length === 0) {
        return NextResponse.json({ found: false, company: null });
      }

      const company = result.rows[0];

      // Count contacts linked to this company
      const contactsResult = await query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM contacts
         WHERE current_company_id = $1 AND NOT is_archived`,
        [company.id],
      );
      const contactCount = parseInt(contactsResult.rows[0]?.count ?? '0', 10);

      // Pending tasks that reference a contact at this company
      const tasksResult = await query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM tasks t
         LEFT JOIN contacts c ON c.id = t.contact_id
         WHERE t.status IN ('pending', 'in_progress')
           AND c.current_company_id = $1`,
        [company.id],
      );
      const tasksPending = parseInt(tasksResult.rows[0]?.count ?? '0', 10);

      // Last page_cache timestamp for this company's LinkedIn URL
      const cacheResult = await query<{ created_at: string }>(
        `SELECT created_at FROM page_cache
         WHERE url LIKE $1
         ORDER BY created_at DESC LIMIT 1`,
        [`%/company/${company.slug}%`],
      );
      const lastCapturedAt = cacheResult.rows[0]?.created_at ?? null;

      return NextResponse.json({
        found: true,
        company: {
          id: company.id,
          name: company.name,
          slug: company.slug,
          domain: company.domain,
          industry: company.industry,
          sizeRange: company.size_range,
          linkedinUrl: company.linkedin_url,
          headquarters: company.headquarters,
          employeeCount: company.employee_count,
          description: company.description,
          contactCount,
          tasksPending,
          lastCapturedAt,
        },
      });
    } catch (error) {
      console.error('[Company Lookup] Error:', error);
      return NextResponse.json(
        { error: 'INTERNAL_ERROR', message: 'Failed to look up company' },
        { status: 500 },
      );
    }
  });
}
