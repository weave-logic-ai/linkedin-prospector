// Automatic outreach template selection based on contact persona and tier.
// Maps scoring classifications to outreach template categories.

import { query } from '@/lib/db/client';

interface TemplateRecommendation {
  templateId: string;
  templateName: string;
  reason: string;
}

/**
 * Returns the recommended outreach template for a contact based on
 * their tier, persona, and optional referral persona.
 */
export async function getRecommendedTemplate(
  tier: string,
  persona: string,
  referralPersona?: string | null
): Promise<TemplateRecommendation | null> {
  const { category, reason } = resolveCategory(tier, persona, referralPersona);

  // Try to find an active template in the resolved category
  let template = await findTemplateByCategory(category);

  // Fall back to initial_outreach if no match
  if (!template && category !== 'initial_outreach') {
    template = await findTemplateByCategory('initial_outreach');
  }

  if (!template) return null;

  return {
    templateId: template.id,
    templateName: template.name,
    reason,
  };
}

function resolveCategory(
  tier: string,
  persona: string,
  referralPersona?: string | null
): { category: string; reason: string } {
  // Referral-persona-based overrides (checked first)
  if (referralPersona === 'warm-introducer') {
    return {
      category: 'referral_ask',
      reason: 'Contact is a warm-introducer — use a referral ask template.',
    };
  }
  if (referralPersona === 'white-label-partner') {
    return {
      category: 'partnership_proposal',
      reason: 'Contact is a white-label partner candidate — propose partnership.',
    };
  }

  // Tier + persona combinations
  if (tier === 'gold' && persona === 'buyer') {
    return {
      category: 'executive_intro',
      reason: 'Gold-tier buyer — use executive introduction template.',
    };
  }
  if (tier === 'gold' && persona === 'warm-lead') {
    return {
      category: 'warm_followup',
      reason: 'Gold-tier warm lead — use warm follow-up template.',
    };
  }
  if (tier === 'silver' && persona === 'hub') {
    return {
      category: 'network_intro',
      reason: 'Silver-tier hub — use network introduction template.',
    };
  }

  // Default
  return {
    category: 'initial_outreach',
    reason: 'Default outreach — no specific persona/tier match.',
  };
}

async function findTemplateByCategory(
  category: string
): Promise<{ id: string; name: string } | null> {
  const result = await query<{ id: string; name: string }>(
    `SELECT id, name FROM outreach_templates
     WHERE category = $1 AND is_active = TRUE
     ORDER BY created_at DESC
     LIMIT 1`,
    [category]
  );
  return result.rows[0] ?? null;
}
