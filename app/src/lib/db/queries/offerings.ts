// Offerings DB queries — stub (will be replaced by DB agent)

import { query } from '../client';

interface OfferingRow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export async function listOfferings(): Promise<OfferingRow[]> {
  const result = await query<OfferingRow>(
    'SELECT * FROM offerings ORDER BY sort_order, name'
  );
  return result.rows;
}

export async function createOffering(data: {
  name: string;
  description?: string;
}): Promise<OfferingRow> {
  const result = await query<OfferingRow>(
    'INSERT INTO offerings (name, description) VALUES ($1, $2) RETURNING *',
    [data.name, data.description ?? null]
  );
  return result.rows[0];
}

export async function updateOffering(
  id: string,
  data: Record<string, unknown>
): Promise<OfferingRow | null> {
  const allowedKeys = ['name', 'description', 'is_active', 'sort_order'];
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
  const result = await query<OfferingRow>(
    `UPDATE offerings SET ${setClauses.join(', ')}, updated_at = now()
     WHERE id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0] ?? null;
}

export async function deleteOffering(id: string): Promise<boolean> {
  const result = await query('DELETE FROM offerings WHERE id = $1 RETURNING id', [id]);
  return result.rows.length > 0;
}
