// Action log (time machine) DB queries

import { query } from '../client';

// Types

export interface ActionLogEntry {
  id: string;
  actionType: string;
  actor: string;
  targetType: string;
  targetId: string | null;
  targetName: string | null;
  beforeSnapshot: Record<string, unknown>;
  afterSnapshot: Record<string, unknown>;
  choices: Record<string, unknown>;
  metadata: Record<string, unknown>;
  revertedAt: string | null;
  revertedBy: string | null;
  createdAt: string;
}

interface ActionLogRow {
  id: string;
  action_type: string;
  actor: string;
  target_type: string;
  target_id: string | null;
  target_name: string | null;
  before_snapshot: Record<string, unknown>;
  after_snapshot: Record<string, unknown>;
  choices: Record<string, unknown>;
  metadata: Record<string, unknown>;
  reverted_at: Date | null;
  reverted_by: string | null;
  created_at: Date;
}

// Queries

export async function recordAction(data: {
  actionType: string;
  actor?: string;
  targetType: string;
  targetId?: string;
  targetName?: string;
  beforeSnapshot?: Record<string, unknown>;
  afterSnapshot?: Record<string, unknown>;
  choices?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const result = await query<{ id: string }>(
    `INSERT INTO action_log
       (action_type, actor, target_type, target_id, target_name,
        before_snapshot, after_snapshot, choices, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      data.actionType,
      data.actor ?? 'user',
      data.targetType,
      data.targetId ?? null,
      data.targetName ?? null,
      JSON.stringify(data.beforeSnapshot ?? {}),
      JSON.stringify(data.afterSnapshot ?? {}),
      JSON.stringify(data.choices ?? {}),
      JSON.stringify(data.metadata ?? {}),
    ]
  );
  return result.rows[0].id;
}

export async function listActions(opts: {
  targetType?: string;
  targetId?: string;
  actionType?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{
  data: ActionLogEntry[];
  pagination: { limit: number; offset: number; total: number };
}> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (opts.targetType) {
    conditions.push(`target_type = $${idx++}`);
    values.push(opts.targetType);
  }
  if (opts.targetId) {
    conditions.push(`target_id = $${idx++}`);
    values.push(opts.targetId);
  }
  if (opts.actionType) {
    conditions.push(`action_type = $${idx++}`);
    values.push(opts.actionType);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM action_log ${where}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  values.push(limit);
  const limitIdx = idx++;
  values.push(offset);
  const offsetIdx = idx;

  const result = await query<ActionLogRow>(
    `SELECT * FROM action_log ${where}
     ORDER BY created_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    values
  );

  return {
    data: result.rows.map(mapActionLog),
    pagination: { limit, offset, total },
  };
}

export async function getAction(id: string): Promise<ActionLogEntry | null> {
  const result = await query<ActionLogRow>(
    'SELECT * FROM action_log WHERE id = $1',
    [id]
  );
  return result.rows[0] ? mapActionLog(result.rows[0]) : null;
}

export async function revertAction(id: string): Promise<{
  revertActionId: string;
  beforeSnapshot: Record<string, unknown>;
} | null> {
  // Fetch the original action
  const original = await query<ActionLogRow>(
    'SELECT * FROM action_log WHERE id = $1',
    [id]
  );

  if (!original.rows[0]) return null;

  const row = original.rows[0];

  // Already reverted
  if (row.reverted_at) return null;

  // Create the revert action entry
  const revertResult = await query<{ id: string }>(
    `INSERT INTO action_log
       (action_type, actor, target_type, target_id, target_name,
        before_snapshot, after_snapshot, choices, metadata)
     VALUES ('revert', 'user', $1, $2, $3, $4, $5, '{}', $6)
     RETURNING id`,
    [
      row.target_type,
      row.target_id,
      row.target_name,
      JSON.stringify(row.after_snapshot),
      JSON.stringify(row.before_snapshot),
      JSON.stringify({ reverted_action_id: id }),
    ]
  );
  const revertActionId = revertResult.rows[0].id;

  // Mark the original action as reverted
  await query(
    `UPDATE action_log SET reverted_at = now_utc(), reverted_by = $1 WHERE id = $2`,
    [revertActionId, id]
  );

  return {
    revertActionId,
    beforeSnapshot: row.before_snapshot,
  };
}

// Helpers

function mapActionLog(row: ActionLogRow): ActionLogEntry {
  return {
    id: row.id,
    actionType: row.action_type,
    actor: row.actor,
    targetType: row.target_type,
    targetId: row.target_id,
    targetName: row.target_name,
    beforeSnapshot: row.before_snapshot,
    afterSnapshot: row.after_snapshot,
    choices: row.choices,
    metadata: row.metadata,
    revertedAt: row.reverted_at?.toISOString() ?? null,
    revertedBy: row.reverted_by,
    createdAt: row.created_at.toISOString(),
  };
}
