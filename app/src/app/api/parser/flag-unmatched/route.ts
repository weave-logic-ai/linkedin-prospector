// POST /api/parser/flag-unmatched
//
// WS-2 Phase 2 Track D. Per `08-phased-delivery.md` §4.1 Unmatched DOM panel
// acceptance:
//   "Each has a 'Flag for selector miss' button that posts to a new
//    POST /api/parser/flag-unmatched endpoint — stores flagged blobs in a
//    new parser_selector_flags table (ship migration 039)."
//
// Stores one row per flag in `parser_selector_flags` (migration 039).
// Tenant-isolated via RLS; the DB policy enforces tenant_id = current tenant.
// Excerpt is capped at 4KB server-side (the DB CHECK also enforces this
// defensively).

import { NextResponse, type NextRequest } from 'next/server';
import { query } from '@/lib/db/client';
import { RESEARCH_FLAGS } from '@/lib/config/research-flags';
import { recordEvent } from '@/lib/analytics/events';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXCERPT_MAX_BYTES = 4096;
const NOTE_MAX_LEN = 2000;

interface FlagUnmatchedBody {
  captureId: string;
  pageType: string;
  domPath: string;
  domHtmlExcerpt: string;
  textPreview?: string;
  userNote?: string;
}

function truncateBytes(s: string, maxBytes: number): string {
  const buf = Buffer.from(s, 'utf-8');
  if (buf.length <= maxBytes) return s;
  return buf.slice(0, maxBytes).toString('utf-8');
}

async function resolveTenantId(): Promise<string | null> {
  try {
    const r = await query<{ tid: string | null }>(
      `SELECT get_current_tenant_id()::text AS tid`
    );
    return r.rows[0]?.tid ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  if (!RESEARCH_FLAGS.parserTelemetry) {
    return NextResponse.json(
      { error: 'RESEARCH_PARSER_TELEMETRY is off' },
      { status: 404 }
    );
  }

  let body: FlagUnmatchedBody;
  try {
    body = (await request.json()) as FlagUnmatchedBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.captureId || !UUID_RE.test(body.captureId)) {
    return NextResponse.json(
      { error: 'captureId must be a UUID' },
      { status: 400 }
    );
  }
  if (!body.pageType || typeof body.pageType !== 'string') {
    return NextResponse.json(
      { error: 'pageType is required' },
      { status: 400 }
    );
  }
  if (!body.domPath || typeof body.domPath !== 'string') {
    return NextResponse.json(
      { error: 'domPath is required' },
      { status: 400 }
    );
  }
  if (!body.domHtmlExcerpt || typeof body.domHtmlExcerpt !== 'string') {
    return NextResponse.json(
      { error: 'domHtmlExcerpt is required' },
      { status: 400 }
    );
  }

  const excerpt = truncateBytes(body.domHtmlExcerpt, EXCERPT_MAX_BYTES);
  const textPreview = body.textPreview
    ? body.textPreview.slice(0, 200)
    : null;
  const userNote = body.userNote
    ? body.userNote.slice(0, NOTE_MAX_LEN)
    : null;

  const tenantId = await resolveTenantId();
  if (!tenantId) {
    return NextResponse.json(
      { error: 'tenant context unavailable' },
      { status: 500 }
    );
  }

  try {
    const r = await query<{ id: string }>(
      `INSERT INTO parser_selector_flags (
         tenant_id, capture_id, page_type, dom_path,
         dom_html_excerpt, text_preview, user_note
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        tenantId,
        body.captureId,
        body.pageType,
        body.domPath,
        excerpt,
        textPreview,
        userNote,
      ]
    );

    const flagId = r.rows[0]?.id ?? null;

    // Emit analytics — best-effort, never fails the flag write.
    await recordEvent({
      event: 'unmatched_flagged',
      properties: {
        captureId: body.captureId,
        pageType: body.pageType,
        excerptBytes: Buffer.byteLength(excerpt, 'utf-8'),
      },
    });

    return NextResponse.json({ id: flagId, stored: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'Failed to store flag', details: message },
      { status: 500 }
    );
  }
}
