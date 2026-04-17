import { ECC_FLAGS } from '../types';
import { emitImpulse } from './emitter';
import { getDefaultTenantId, getTargetById } from '../../targets/service';
import type { CompositeScore } from '../../scoring/types';

/**
 * Resolve the tenant id for an ECC scoring impulse.
 *
 * Resolution order (matches `ecc/causal-graph/scoring-adapter.ts` —
 * `DEFAULT_TENANT_ID = 'default'` literal removed per WS-4 polish):
 *   1. Caller-supplied override (`tenantIdOverride`).
 *   2. The `tenant_id` on the target row referenced by `targetId`.
 *   3. Fallback to the default tenant (single-tenant local mode).
 *
 * The scoring pipeline passes a targetId into the provenance adapter
 * today; this sibling adapter now follows the same plumbing so contact
 * impulses inherit the tenant context instead of the literal `'default'`.
 */
async function resolveTenantId(
  targetId?: string,
  tenantIdOverride?: string
): Promise<string> {
  if (tenantIdOverride) return tenantIdOverride;
  if (targetId) {
    const target = await getTargetById(targetId);
    if (target) return target.tenantId;
  }
  return getDefaultTenantId();
}

/**
 * Emit impulses based on scoring state changes.
 * Called after a contact's score is computed and saved.
 *
 * The `tenantId` parameter stays on the signature for callers that already
 * resolved their tenant (tests, internal dispatchers). When omitted the
 * adapter resolves it via the shared resolver above. `targetId` is the
 * optional hint that lets the resolver find the correct tenant without a
 * caller-side override.
 */
export async function emitScoringImpulses(
  contactId: string,
  oldScore: CompositeScore | null,
  newScore: CompositeScore,
  tenantId?: string,
  targetId?: string
): Promise<void> {
  if (!ECC_FLAGS.impulses) return;

  const resolvedTenantId = await resolveTenantId(targetId, tenantId);

  // Always emit score_computed
  await emitImpulse(resolvedTenantId, 'score_computed', 'contact', contactId, {
    composite: newScore.compositeScore,
    tier: newScore.tier,
    persona: newScore.persona,
    behavioralPersona: newScore.behavioralPersona,
    referralPersona: newScore.referralPersona,
  });

  // Emit tier_changed if tier differs
  if (oldScore && oldScore.tier !== newScore.tier) {
    await emitImpulse(resolvedTenantId, 'tier_changed', 'contact', contactId, {
      from: oldScore.tier,
      to: newScore.tier,
      composite: newScore.compositeScore,
    });
  }

  // Emit persona_assigned if persona differs
  if (oldScore && oldScore.persona !== newScore.persona) {
    await emitImpulse(resolvedTenantId, 'persona_assigned', 'contact', contactId, {
      from: oldScore.persona,
      to: newScore.persona,
    });
  }
}
