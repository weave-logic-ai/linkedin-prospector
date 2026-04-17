// POST /api/scoring/run - Trigger scoring run (single or batch)
//
// Phase 1.5 — WS-4 per-target ICP plumbing (see
// `.planning/research-tools-sprint/08-phased-delivery.md` §3.4): the body now
// accepts an optional `targetId`. When provided (and the targets flag is on),
// `scoreContact` / `scoreBatch` swap the owner-default ICP list for the ICPs
// attached to the target's active lens. When omitted the behavior is
// exactly today's.

import { NextRequest, NextResponse } from 'next/server';
import { scoreContact, scoreBatch } from '@/lib/scoring/pipeline';
import { scoreContactWithProvenance } from '@/lib/ecc/causal-graph/scoring-adapter';
import { ECC_FLAGS } from '@/lib/ecc/types';

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    const { contactId, contactIds, profileName, targetId } = body as {
      contactId?: string;
      contactIds?: string[];
      profileName?: string;
      targetId?: string;
    };
    // Allow ?targetId= as a query param too — cheaper for simple client fetches.
    const resolvedTargetId = targetId ?? searchParams.get('targetId') ?? undefined;

    if (contactId) {
      const result = ECC_FLAGS.causalGraph
        ? await scoreContactWithProvenance(contactId, profileName, resolvedTargetId)
        : await scoreContact(contactId, profileName, resolvedTargetId);
      return NextResponse.json({ data: result });
    }

    const results = await scoreBatch(contactIds, profileName, resolvedTargetId);
    return NextResponse.json({
      data: {
        scored: results.length,
        results: results.slice(0, 100), // Limit response size
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to run scoring', details: error instanceof Error ? error.message : undefined },
      { status: 500 }
    );
  }
}
