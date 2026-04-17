// POST /api/extension/contact/create-from-mention
//
// Creates a `contacts` row from a snippet mention dropdown's "Create new"
// action. Per Q9 A+C in `.planning/research-tools-sprint/10-decisions.md`:
//
//   - Minimal fields on create: `name` + optional `linkedinUrl`.
//   - `discovered_via = ['snippet']` so downstream filters know the origin.
//   - `notes` stores the 200-char excerpt around the mention (for later review).
//   - When `linkedinUrl` is present, fire-and-forget LinkedIn-only enrichment.
//     Paid providers (PDL, Apollo, Lusha, TheirStack) never run here —
//     enforced by the `enrichContactFromLinkedIn` helper.
//
// Gated on `RESEARCH_FLAGS.snippets`; 404 when off (the extension treats this
// as "feature not available" and falls back to the legacy dropdown).

import { NextRequest, NextResponse } from 'next/server';
import { withExtensionAuth } from '@/lib/middleware/extension-auth-middleware';
import { RESEARCH_FLAGS } from '@/lib/config/research-flags';
import { query } from '@/lib/db/client';
import { enrichContactFromLinkedIn } from '@/lib/enrichment/linkedin-only';

interface CreateFromMentionBody {
  name: string;
  linkedinUrl?: string;
  snippetSourceUrl: string;
  context: string;
}

const MAX_CONTEXT_LENGTH = 200;
const MAX_NAME_LENGTH = 120;

function validateBody(body: unknown):
  | { ok: true; value: CreateFromMentionBody }
  | { ok: false; message: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, message: 'Body must be an object' };
  }
  const b = body as Record<string, unknown>;
  if (typeof b.name !== 'string' || b.name.trim().length === 0) {
    return { ok: false, message: 'name must be a non-empty string' };
  }
  if (b.name.length > MAX_NAME_LENGTH) {
    return { ok: false, message: `name exceeds ${MAX_NAME_LENGTH}-char limit` };
  }
  if (typeof b.snippetSourceUrl !== 'string' || !/^https?:\/\//i.test(b.snippetSourceUrl)) {
    return { ok: false, message: 'snippetSourceUrl must be an http(s) URL' };
  }
  if (typeof b.context !== 'string') {
    return { ok: false, message: 'context must be a string' };
  }
  if (b.linkedinUrl !== undefined && b.linkedinUrl !== null) {
    if (typeof b.linkedinUrl !== 'string' || !/linkedin\.com\//i.test(b.linkedinUrl)) {
      return {
        ok: false,
        message: 'linkedinUrl, when provided, must contain linkedin.com/',
      };
    }
  }
  return {
    ok: true,
    value: {
      name: b.name.trim(),
      linkedinUrl:
        typeof b.linkedinUrl === 'string' && b.linkedinUrl.trim().length > 0
          ? b.linkedinUrl.trim()
          : undefined,
      snippetSourceUrl: b.snippetSourceUrl,
      context: String(b.context).slice(0, MAX_CONTEXT_LENGTH),
    },
  };
}

/**
 * Split a display name into first/last on the first whitespace. Anything past
 * the second token becomes part of the last name ("Juan Carlos Perez" → first
 * "Juan", last "Carlos Perez"). This is adequate for the Phase 1.5 UI where
 * the user confirms the name before saving.
 */
function splitName(name: string): { first: string; last: string | null } {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

/**
 * Placeholder URL used when no LinkedIn URL is supplied. The `contacts` table
 * has `linkedin_url TEXT UNIQUE NOT NULL` (migration 002), so we cannot leave
 * it null. The `snippet-created://` scheme is intentionally not http(s) so
 * nothing ever tries to open it in a browser, and it embeds a UUID for
 * uniqueness. A future compaction step can normalise these once the contact
 * is linked to a real profile.
 */
function placeholderLinkedInUrl(): string {
  return `snippet-created://${crypto.randomUUID()}`;
}

export async function POST(req: NextRequest) {
  if (!RESEARCH_FLAGS.snippets) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  return withExtensionAuth(req, async () => {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'INVALID_JSON', message: 'Body must be valid JSON' },
        { status: 400 }
      );
    }
    const parsed = validateBody(raw);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: parsed.message },
        { status: 400 }
      );
    }
    const { name, linkedinUrl, snippetSourceUrl, context } = parsed.value;

    const { first, last } = splitName(name);
    const finalLinkedInUrl = linkedinUrl ?? placeholderLinkedInUrl();
    const notes = `Created from snippet at ${snippetSourceUrl}: "${context}"`;

    try {
      // Match on `linkedin_url` — if one already exists (likely only when the
      // user supplied a real URL) we return it rather than forcing a conflict.
      if (linkedinUrl) {
        const existing = await query<{ id: string; full_name: string }>(
          `SELECT id, full_name FROM contacts WHERE linkedin_url = $1 LIMIT 1`,
          [linkedinUrl]
        );
        if (existing.rows[0]) {
          return NextResponse.json({
            success: true,
            reused: true,
            contactId: existing.rows[0].id,
            fullName: existing.rows[0].full_name,
            enrichment: { invoked: false, skipReason: 'already existed' },
          });
        }
      }

      const inserted = await query<{ id: string }>(
        `INSERT INTO contacts
           (linkedin_url, first_name, last_name, full_name, notes, discovered_via)
         VALUES ($1, $2, $3, $4, $5, ARRAY['snippet']::TEXT[])
         RETURNING id`,
        [finalLinkedInUrl, first, last, name, notes]
      );
      const contactId = inserted.rows[0].id;

      // Fire-and-forget LinkedIn-only enrichment (no await blocks the response;
      // we still await here so any thrown error lands in the try/catch and the
      // client learns it via the `enrichment.invoked=false` + reason field).
      let enrichment: {
        invoked: boolean;
        skipReason?: string;
      } = { invoked: false };
      if (linkedinUrl) {
        try {
          const result = await enrichContactFromLinkedIn({
            id: contactId,
            linkedinUrl,
            firstName: first,
            lastName: last,
            fullName: name,
            title: null,
            currentCompany: null,
            email: null,
          });
          enrichment = {
            invoked: result.invoked,
            skipReason: result.skipReason,
          };
        } catch (err) {
          // Never let a provider error block the contact creation.
          enrichment = {
            invoked: false,
            skipReason: `enrichment error: ${(err as Error).message}`,
          };
        }
      } else {
        enrichment = { invoked: false, skipReason: 'no linkedin_url supplied' };
      }

      return NextResponse.json({
        success: true,
        reused: false,
        contactId,
        fullName: name,
        enrichment,
      });
    } catch (err) {
      console.error('[Contact Create-from-mention] Failed:', err);
      return NextResponse.json(
        { error: 'INTERNAL_ERROR', message: (err as Error).message },
        { status: 500 }
      );
    }
  });
}
