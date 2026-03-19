// GET /api/outreach/recommend?contactId=... - recommend template for a contact

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { getRecommendedTemplate } from '@/lib/outreach/template-matcher';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  try {
    const contactId = request.nextUrl.searchParams.get('contactId');

    if (!contactId || !UUID_REGEX.test(contactId)) {
      return NextResponse.json(
        { error: 'Valid contactId query parameter is required' },
        { status: 400 }
      );
    }

    // Load contact score
    const scoreResult = await query<{
      tier: string;
      persona: string;
      referral_persona: string | null;
    }>(
      'SELECT tier, persona, referral_persona FROM contact_scores WHERE contact_id = $1',
      [contactId]
    );

    if (scoreResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Contact has no score. Score the contact first.' },
        { status: 404 }
      );
    }

    const { tier, persona, referral_persona } = scoreResult.rows[0];
    const recommendation = await getRecommendedTemplate(tier, persona, referral_persona);

    if (!recommendation) {
      return NextResponse.json({
        template: null,
        reason: 'No active templates found.',
      });
    }

    return NextResponse.json({
      template: {
        id: recommendation.templateId,
        name: recommendation.templateName,
      },
      reason: recommendation.reason,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to recommend template', details: error instanceof Error ? error.message : undefined },
      { status: 500 }
    );
  }
}
