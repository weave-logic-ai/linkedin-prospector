// POST /api/extension/snippet
//
// Text snippet save endpoint — Phase 1 Track C of the research-tools sprint.
// Accepts a selected text fragment from any permitted origin (per ADR-028) and
// writes it to the ECC substrate as a `causal_nodes` row plus edges and an
// ExoChain entry under `snippet:<kind>:<target_id>` (ADR-029).
//
// Gated on `RESEARCH_FLAGS.snippets`. When the flag is off the route returns
// 404 so the extension widget treats the endpoint as absent.

import { NextRequest, NextResponse } from 'next/server';
import { withExtensionAuth } from '@/lib/middleware/extension-auth-middleware';
import { RESEARCH_FLAGS } from '@/lib/config/research-flags';
import { getDefaultTenantId } from '@/lib/snippets/tenant';
import { saveTextSnippet } from '@/lib/snippets/service';
import type { SnippetSaveRequest } from '@/lib/snippets/types';

export async function POST(req: NextRequest) {
  if (!RESEARCH_FLAGS.snippets) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  return withExtensionAuth(req, async () => {
    let body: SnippetSaveRequest;
    try {
      body = (await req.json()) as SnippetSaveRequest;
    } catch {
      return NextResponse.json(
        { error: 'INVALID_JSON', message: 'Body must be valid JSON' },
        { status: 400 }
      );
    }

    const validation = validateSnippetBody(body);
    if (!validation.ok) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: validation.message },
        { status: 400 }
      );
    }

    try {
      const tenantId = await getDefaultTenantId();
      const result = await saveTextSnippet({
        tenantId,
        targetKind: body.targetKind,
        targetId: body.targetId,
        text: body.text,
        sourceUrl: body.sourceUrl,
        pageType: body.pageType,
        tagSlugs: body.tagSlugs,
        note: body.note,
        mentionContactIds: body.mentionContactIds,
        sessionId: body.sessionId,
      });
      return NextResponse.json({
        success: true,
        ...result,
      });
    } catch (err) {
      console.error('[Snippet] save failed:', err);
      return NextResponse.json(
        { error: 'INTERNAL_ERROR', message: (err as Error).message },
        { status: 500 }
      );
    }
  });
}

function validateSnippetBody(body: unknown): { ok: true } | { ok: false; message: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, message: 'Body must be an object' };
  }
  const b = body as Record<string, unknown>;
  if (b.targetKind !== 'self' && b.targetKind !== 'contact' && b.targetKind !== 'company') {
    return { ok: false, message: 'targetKind must be one of self | contact | company' };
  }
  if (typeof b.targetId !== 'string' || b.targetId.length === 0) {
    return { ok: false, message: 'targetId must be a non-empty string' };
  }
  if (typeof b.text !== 'string' || b.text.trim().length === 0) {
    return { ok: false, message: 'text must be a non-empty string' };
  }
  if (b.text.length > 20000) {
    return { ok: false, message: 'text exceeds 20,000 character limit' };
  }
  if (typeof b.sourceUrl !== 'string' || !/^https?:\/\//.test(b.sourceUrl)) {
    return { ok: false, message: 'sourceUrl must be an http(s) URL' };
  }
  if (b.tagSlugs !== undefined && !Array.isArray(b.tagSlugs)) {
    return { ok: false, message: 'tagSlugs must be an array of strings' };
  }
  if (b.mentionContactIds !== undefined && !Array.isArray(b.mentionContactIds)) {
    return { ok: false, message: 'mentionContactIds must be an array of strings' };
  }
  if (b.note !== undefined && b.note !== null && typeof b.note !== 'string') {
    return { ok: false, message: 'note must be a string or null' };
  }
  return { ok: true };
}
