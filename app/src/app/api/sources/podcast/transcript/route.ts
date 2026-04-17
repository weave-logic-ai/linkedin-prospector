// POST /api/sources/podcast/transcript
//
// User-uploaded podcast transcript. Accepts:
//   {
//     podcastUrl: string,        // the canonical RSS feed URL
//     episodeGuid: string,       // matches the episode `<guid>` from the feed
//     transcriptText: string,    // the transcript body
//     format: 'srt' | 'vtt' | 'plain',
//   }
//
// The handler locates the matching `source_records` row (dedup key is
// `<feedUrl>::<episodeGuid>`) and upserts a `source_field_values` row with
// `field_name='transcript'`, flattening SRT / VTT to plain text for the
// indexed body.
//
// Gated on RESEARCH_FLAGS.sources + RESEARCH_FLAGS.connectorPodcast. RLS on
// source_field_values ensures a user can only upload against records in
// their own tenant (tenant_id filter in the UPDATE path; insert receives
// tenant_id from the owning source_records row).

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { RESEARCH_FLAGS } from '@/lib/config/research-flags';
import { getDefaultTenantId } from '@/lib/db/tenants';
import { query } from '@/lib/db/client';
import {
  flattenSubtitleText,
} from '@/lib/sources/connectors/podcast';
import { canonicalizeUrl } from '@/lib/sources/url-normalize';

export const dynamic = 'force-dynamic';

const InputSchema = z.object({
  podcastUrl: z.string().min(1),
  episodeGuid: z.string().min(1),
  transcriptText: z.string().min(1).max(2_000_000),
  format: z.enum(['srt', 'vtt', 'plain']),
});

export async function POST(req: NextRequest) {
  if (!RESEARCH_FLAGS.sources || !RESEARCH_FLAGS.connectorPodcast) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'VALIDATION_FAILED', details: parsed.error.issues },
      { status: 400 }
    );
  }
  const input = parsed.data;

  let canonicalFeed: string;
  try {
    canonicalFeed = canonicalizeUrl(input.podcastUrl);
  } catch {
    return NextResponse.json({ error: 'INVALID_PODCAST_URL' }, { status: 400 });
  }

  const tenantId = await getDefaultTenantId();
  const sourceId = `${canonicalFeed}::${input.episodeGuid}`;

  // Locate the episode row. RLS policy on source_records enforces tenant
  // scoping at the DB level; we include the tenant_id predicate explicitly
  // for defense-in-depth + efficient index hit.
  const recordRes = await query<{ id: string; tenant_id: string }>(
    `SELECT id, tenant_id
     FROM source_records
     WHERE tenant_id = $1 AND source_type = 'podcast' AND source_id = $2`,
    [tenantId, sourceId]
  );
  const record = recordRes.rows[0];
  if (!record) {
    return NextResponse.json({ error: 'EPISODE_NOT_FOUND' }, { status: 404 });
  }

  const plainText = flattenSubtitleText(input.transcriptText, input.format);
  const fieldValue = {
    format: input.format,
    originalLength: input.transcriptText.length,
    text: plainText,
  };

  // Look up the category_default for podcast so final_weight materializes
  // correctly (per ADR-030). If weights are unset, default to 0.80 (the
  // seed value from `036-sources-schema.sql`).
  const weightRes = await query<{ category_default: number }>(
    `SELECT category_default FROM source_type_weights
     WHERE tenant_id = $1 AND source_type = 'podcast'`,
    [tenantId]
  );
  const categoryDefault = weightRes.rows[0]?.category_default ?? 0.8;

  // `subject_kind='contact'` is a stub here: the transcript is attached to
  // the source record (not a specific contact); we write it against the
  // podcast record's surrogate subject — we reuse the record id as subject
  // id so the uniqueness constraint (source_record_id, subject_kind,
  // subject_id, field_name) is satisfied without falsely claiming a
  // specific contact. A future improvement is to surface detected guest
  // names here and write one row per guest.
  await query(
    `INSERT INTO source_field_values
       (tenant_id, source_record_id, subject_kind, subject_id, field_name,
        field_value, referenced_date, category_default_snapshot,
        per_item_multiplier, extracted_by)
     VALUES ($1, $2, 'contact', $3, 'transcript', $4::jsonb, NULL, $5, 1.0, 'user-override')
     ON CONFLICT (source_record_id, subject_kind, subject_id, field_name) DO UPDATE
       SET field_value = EXCLUDED.field_value,
           category_default_snapshot = EXCLUDED.category_default_snapshot,
           extracted_by = EXCLUDED.extracted_by,
           updated_at = NOW()`,
    [
      tenantId,
      record.id,
      record.id,
      JSON.stringify(fieldValue),
      categoryDefault,
    ]
  );

  // Also touch the record metadata so clients that only read source_records
  // see the transcript presence flag.
  await query(
    `UPDATE source_records
       SET metadata = metadata || jsonb_build_object('userUploadedTranscript', true, 'userTranscriptFormat', $2::text)
     WHERE id = $1 AND tenant_id = $3`,
    [record.id, input.format, tenantId]
  );

  return NextResponse.json({
    success: true,
    sourceRecordId: record.id,
    format: input.format,
    storedLength: plainText.length,
  });
}
