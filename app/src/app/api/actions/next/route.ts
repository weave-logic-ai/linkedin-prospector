// GET /api/actions/next - returns the highest-value next action

import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';

interface NextAction {
  action: string;
  type: 'task' | 'outreach' | 'enrichment' | 'import';
  contactId?: string;
  taskId?: string;
  url?: string;
}

export async function GET() {
  try {
    // 1. Check pending tasks sorted by priority
    const taskResult = await query<{
      id: string;
      title: string;
      contact_id: string | null;
      url: string | null;
    }>(
      `SELECT id, title, contact_id, url
       FROM tasks
       WHERE status = 'pending'
       ORDER BY priority ASC, created_at ASC
       LIMIT 1`
    );

    if (taskResult.rows.length > 0) {
      const task = taskResult.rows[0];
      const action: NextAction = {
        action: task.title,
        type: 'task',
        taskId: task.id,
        contactId: task.contact_id ?? undefined,
        url: task.url ?? undefined,
      };
      return NextResponse.json(action);
    }

    // 2. Check gold contacts without outreach state
    const goldResult = await query<{
      id: string;
      full_name: string;
      linkedin_url: string | null;
    }>(
      `SELECT c.id, c.full_name, c.linkedin_url
       FROM contacts c
       JOIN contact_scores cs ON cs.contact_id = c.id
       WHERE cs.tier = 'gold'
         AND c.is_archived = FALSE
         AND NOT EXISTS (SELECT 1 FROM outreach_states os WHERE os.contact_id = c.id)
       ORDER BY cs.composite_score DESC
       LIMIT 1`
    );

    if (goldResult.rows.length > 0) {
      const contact = goldResult.rows[0];
      const action: NextAction = {
        action: `Reach out to ${contact.full_name}`,
        type: 'outreach',
        contactId: contact.id,
        url: contact.linkedin_url ?? undefined,
      };
      return NextResponse.json(action);
    }

    // 3. Check contacts due for re-enrichment (enriched > 30 days ago)
    const enrichResult = await query<{
      id: string;
      full_name: string;
      linkedin_url: string | null;
    }>(
      `SELECT c.id, c.full_name, c.linkedin_url
       FROM contacts c
       JOIN enrichment_log el ON el.contact_id = c.id
       WHERE c.is_archived = FALSE
         AND el.enriched_at < NOW() - INTERVAL '30 days'
         AND NOT EXISTS (
           SELECT 1 FROM enrichment_log el2
           WHERE el2.contact_id = c.id AND el2.enriched_at >= NOW() - INTERVAL '30 days'
         )
       ORDER BY el.enriched_at ASC
       LIMIT 1`
    );

    if (enrichResult.rows.length > 0) {
      const contact = enrichResult.rows[0];
      const action: NextAction = {
        action: `Re-enrich ${contact.full_name}`,
        type: 'enrichment',
        contactId: contact.id,
        url: contact.linkedin_url ?? undefined,
      };
      return NextResponse.json(action);
    }

    // 4. Fallback: suggest importing more contacts
    const action: NextAction = {
      action: 'Import more contacts or capture profiles from LinkedIn',
      type: 'import',
    };
    return NextResponse.json(action);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to determine next action', details: error instanceof Error ? error.message : undefined },
      { status: 500 }
    );
  }
}
