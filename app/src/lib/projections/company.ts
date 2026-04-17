// Company projection — WS-2 Phase 2 Track D.
// Per `08-phased-delivery.md` §4.1:
//   companies → { name, industry, sizeRange, headquarters, employeeCount }

import { query } from '@/lib/db/client';
import type { CompanyProjection } from './types';

export interface CompanyRow {
  id: string;
  name: string | null;
  industry: string | null;
  size_range: string | null;
  headquarters: string | null;
  employee_count: number | null;
}

function coerceString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function coerceNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function projectCompanyRow(row: CompanyRow): CompanyProjection {
  return {
    name: coerceString(row.name),
    industry: coerceString(row.industry),
    sizeRange: coerceString(row.size_range),
    headquarters: coerceString(row.headquarters),
    employeeCount: coerceNumber(row.employee_count),
  };
}

export async function loadCompanyProjection(
  companyId: string
): Promise<CompanyProjection | null> {
  const r = await query<CompanyRow>(
    `SELECT id, name, industry, size_range, headquarters, employee_count
     FROM companies
     WHERE id = $1
     LIMIT 1`,
    [companyId]
  );
  if (r.rows.length === 0) return null;
  return projectCompanyRow(r.rows[0]);
}

export async function loadCompanyProjectionFromCapture(
  captureId: string
): Promise<CompanyProjection | null> {
  const r = await query<CompanyRow>(
    `SELECT co.id, co.name, co.industry, co.size_range, co.headquarters,
            co.employee_count
     FROM companies co
     JOIN page_cache pc ON pc.url LIKE '%' || COALESCE(co.linkedin_url, '__never__') || '%'
     WHERE pc.id = $1
     LIMIT 1`,
    [captureId]
  );
  if (r.rows.length === 0) return null;
  return projectCompanyRow(r.rows[0]);
}
