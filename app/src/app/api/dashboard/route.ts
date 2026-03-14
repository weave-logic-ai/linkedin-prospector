// GET /api/dashboard - Aggregate dashboard data

import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';

interface DashboardStats {
  totalContacts: number;
  tierDistribution: { gold: number; silver: number; bronze: number; watch: number };
  enrichedCount: number;
  enrichmentRate: number;
  recentImports: number;
}

interface DashboardBudget {
  budgetCents: number;
  spentCents: number;
  utilization: number;
  lookupCount: number;
}

interface DashboardActivity {
  type: string;
  description: string;
  timestamp: string;
}

interface DashboardNetworkHealth {
  dataMaturity: number;
  graphMetricsComputed: boolean;
  embeddingsGenerated: number;
  totalEdges: number;
}

interface DashboardResponse {
  stats: DashboardStats;
  budget: DashboardBudget;
  recentActivity: DashboardActivity[];
  networkHealth: DashboardNetworkHealth;
}

export async function GET() {
  try {
    // Run all independent queries in parallel for efficiency
    const [
      contactCountResult,
      tierResult,
      enrichedResult,
      budgetResult,
      recentImportsResult,
      edgesResult,
      embeddingsResult,
      graphComputedResult,
    ] = await Promise.all([
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM contacts WHERE NOT is_archived`
      ),
      query<{ tier: string; count: string }>(
        `SELECT tier, COUNT(*)::text AS count FROM contact_scores GROUP BY tier`
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM person_enrichments`
      ),
      query<{
        budget_cents: number;
        spent_cents: number;
        lookup_count: number;
      }>(
        `SELECT budget_cents, spent_cents, lookup_count
         FROM budget_periods
         ORDER BY period_start DESC
         LIMIT 1`
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM import_sessions
         WHERE started_at > NOW() - INTERVAL '7 days'`
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM edges`
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM profile_embeddings`
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM graph_metrics WHERE pagerank > 0`
      ),
    ]);

    // Parse contact count
    const totalContacts = parseInt(contactCountResult.rows[0]?.count ?? '0', 10);

    // Parse tier distribution
    const tierDistribution = { gold: 0, silver: 0, bronze: 0, watch: 0 };
    for (const row of tierResult.rows) {
      const tier = row.tier as keyof typeof tierDistribution;
      if (tier in tierDistribution) {
        tierDistribution[tier] = parseInt(row.count, 10);
      }
    }

    // Parse enrichment count and rate
    const enrichedCount = parseInt(enrichedResult.rows[0]?.count ?? '0', 10);
    const enrichmentRate = totalContacts > 0 ? enrichedCount / totalContacts : 0;

    // Parse budget
    const budgetRow = budgetResult.rows[0];
    const budgetCents = budgetRow?.budget_cents ?? 0;
    const spentCents = budgetRow?.spent_cents ?? 0;
    const lookupCount = budgetRow?.lookup_count ?? 0;
    const utilization = budgetCents > 0 ? spentCents / budgetCents : 0;

    // Parse recent imports
    const recentImports = parseInt(recentImportsResult.rows[0]?.count ?? '0', 10);

    // Parse network health
    const totalEdges = parseInt(edgesResult.rows[0]?.count ?? '0', 10);
    const embeddingsGenerated = parseInt(embeddingsResult.rows[0]?.count ?? '0', 10);
    const graphMetricsCount = parseInt(graphComputedResult.rows[0]?.count ?? '0', 10);
    const graphMetricsComputed = graphMetricsCount > 0;

    // Compute data maturity score (0-100)
    // Factors: contacts exist, enrichment coverage, graph computed, embeddings coverage
    const hasContacts = totalContacts > 0 ? 20 : 0;
    const enrichmentCoverage = Math.min(30, Math.round(enrichmentRate * 30));
    const hasGraph = graphMetricsComputed ? 25 : 0;
    const embeddingCoverage = totalContacts > 0
      ? Math.min(25, Math.round((embeddingsGenerated / totalContacts) * 25))
      : 0;
    const dataMaturity = hasContacts + enrichmentCoverage + hasGraph + embeddingCoverage;

    // Build recent activity from import sessions
    const activityResult = await query<{
      status: string;
      new_records: number;
      updated_records: number;
      started_at: Date | null;
      completed_at: Date | null;
    }>(
      `SELECT status, new_records, updated_records, started_at, completed_at
       FROM import_sessions
       ORDER BY created_at DESC
       LIMIT 10`
    );

    const recentActivity: DashboardActivity[] = activityResult.rows.map((row) => {
      const timestamp = (row.completed_at ?? row.started_at)?.toISOString() ?? new Date().toISOString();
      if (row.status === 'completed') {
        return {
          type: 'import',
          description: `Imported ${row.new_records} new, ${row.updated_records} updated contacts`,
          timestamp,
        };
      }
      return {
        type: 'import',
        description: `Import ${row.status}`,
        timestamp,
      };
    });

    const response: DashboardResponse = {
      stats: {
        totalContacts,
        tierDistribution,
        enrichedCount,
        enrichmentRate,
        recentImports,
      },
      budget: {
        budgetCents,
        spentCents,
        utilization,
        lookupCount,
      },
      recentActivity,
      networkHealth: {
        dataMaturity,
        graphMetricsComputed,
        embeddingsGenerated,
        totalEdges,
      },
    };

    return NextResponse.json({ data: response });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to load dashboard data', details: error instanceof Error ? error.message : undefined },
      { status: 500 }
    );
  }
}
