// Niche profiles DB queries

import { query } from '../client';

export interface NicheRow {
  id: string;
  name: string;
  description: string | null;
  industry: string | null;
  keywords: string[];
  company_size_range: string | null;
  geo_focus: string[];
  member_count: number;
  affordability: number | null;
  fitability: number | null;
  buildability: number | null;
  niche_score: number | null;
  created_at: Date;
  updated_at: Date;
}

export async function listNiches(): Promise<NicheRow[]> {
  const result = await query<NicheRow>(
    `SELECT id, name, description, industry, keywords, company_size_range,
            geo_focus, member_count, affordability, fitability, buildability,
            niche_score, created_at, updated_at
     FROM niche_profiles
     ORDER BY niche_score DESC NULLS LAST, name`
  );
  return result.rows;
}

export async function getNiche(id: string): Promise<NicheRow | null> {
  const result = await query<NicheRow>(
    `SELECT id, name, description, industry, keywords, company_size_range,
            geo_focus, member_count, affordability, fitability, buildability,
            niche_score, created_at, updated_at
     FROM niche_profiles
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createNiche(data: {
  name: string;
  description?: string;
  industry?: string;
  keywords?: string[];
  affordability?: number;
  fitability?: number;
  buildability?: number;
}): Promise<NicheRow> {
  const result = await query<NicheRow>(
    `INSERT INTO niche_profiles (name, description, industry, keywords, affordability, fitability, buildability)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      data.name,
      data.description ?? null,
      data.industry ?? null,
      data.keywords ?? [],
      data.affordability ?? null,
      data.fitability ?? null,
      data.buildability ?? null,
    ]
  );
  return result.rows[0];
}

export async function updateNiche(
  id: string,
  data: Record<string, unknown>
): Promise<NicheRow | null> {
  const allowedKeys = ['name', 'description', 'industry', 'keywords', 'affordability', 'fitability', 'buildability'];
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  for (const [key, value] of Object.entries(data)) {
    if (allowedKeys.includes(key)) {
      setClauses.push(`${key} = $${idx++}`);
      values.push(value);
    }
  }

  if (setClauses.length === 0) return null;

  values.push(id);
  const result = await query<NicheRow>(
    `UPDATE niche_profiles SET ${setClauses.join(', ')}, updated_at = now()
     WHERE id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0] ?? null;
}

export async function deleteNiche(id: string): Promise<boolean> {
  const result = await query('DELETE FROM niche_profiles WHERE id = $1 RETURNING id', [id]);
  return result.rows.length > 0;
}
