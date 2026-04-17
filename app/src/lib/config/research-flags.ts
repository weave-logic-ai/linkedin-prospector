// Research Tools Sprint — Phase 0 feature flags.
//
// Mirrors the ECC_FLAGS pattern from `app/src/lib/ecc/types.ts`: every adapter
// reads flags through this single module so a process-level env flip is the
// only thing that changes behavior. All flags default to `false`; turning
// them on enables the sprint's designed behavior (see
// `07-architecture-and-schema.md` §5).
//
// Per user decision Q10 (`10-decisions.md`), per-user research-mode eligibility
// lives on `owner_profiles.research_mode_enabled` — not in this module. These
// env flags are the server-side master switches for the entire capability.

export interface ResearchFlags {
  /** WS-4 — research target model, state, breadcrumbs, graph re-centering. */
  targets: boolean;
  /** WS-3 — snippet capture + snippet_blobs + snippet_tags. */
  snippets: boolean;
  /** WS-1 — parse_field_outcomes writes + regression reports + selector audit. */
  parserTelemetry: boolean;
  /** WS-5 — source_records + connectors (Wayback, EDGAR, RSS, news, blog, podcast). */
  sources: boolean;
  /** Phase 3 Track G — targeted news scrapers master switch. */
  connectorNews: boolean;
  /** Phase 3 Track G — per-site news sub-flags (default off individually). */
  connectorNewsSites: {
    wsj: boolean;
    bloomberg: boolean;
    reuters: boolean;
    techcrunch: boolean;
    cnbc: boolean;
  };
  /** Phase 3 Track G — podcast RSS + transcript connector. */
  connectorPodcast: boolean;
}

export const RESEARCH_FLAGS: ResearchFlags = {
  targets: process.env.RESEARCH_TARGETS === 'true',
  snippets: process.env.RESEARCH_SNIPPETS === 'true',
  parserTelemetry: process.env.RESEARCH_PARSER_TELEMETRY === 'true',
  sources: process.env.RESEARCH_SOURCES === 'true',
  connectorNews: process.env.RESEARCH_CONNECTOR_NEWS === 'true',
  connectorNewsSites: {
    wsj: process.env.RESEARCH_CONNECTOR_NEWS_WSJ === 'true',
    bloomberg: process.env.RESEARCH_CONNECTOR_NEWS_BLOOMBERG === 'true',
    reuters: process.env.RESEARCH_CONNECTOR_NEWS_REUTERS === 'true',
    techcrunch: process.env.RESEARCH_CONNECTOR_NEWS_TECHCRUNCH === 'true',
    cnbc: process.env.RESEARCH_CONNECTOR_NEWS_CNBC === 'true',
  },
  connectorPodcast: process.env.RESEARCH_CONNECTOR_PODCAST === 'true',
};

/** News site flag lookup keyed by connector origin name. */
export function isNewsSiteEnabled(
  origin: 'wsj' | 'bloomberg' | 'reuters' | 'techcrunch' | 'cnbc'
): boolean {
  return (
    RESEARCH_FLAGS.connectorNews && RESEARCH_FLAGS.connectorNewsSites[origin]
  );
}
