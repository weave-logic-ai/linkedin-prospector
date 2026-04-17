// Research Tools Sprint — WS-5 source connector types.
//
// Mirrors the interface sketched in `05-source-expansion.md` §3 but tightened
// for the Phase 2 Track E Wayback + EDGAR shipment. Future connectors (RSS,
// news, blog, podcast — Phase 3) will extend these types as needed. For now we
// keep only the surface area the two shipping connectors actually use.

export type SourceType =
  | 'wayback'
  | 'edgar'
  | 'rss'
  | 'news'
  | 'blog'
  | 'podcast';

/**
 * Everything a connector needs from its caller at fetch time. Carried through
 * the service.ts orchestrator so connectors never need to touch the DB client
 * directly for tenant resolution.
 */
export interface ConnectorContext {
  tenantId: string;
  /** Current user if invoked inside a request; null for cron-driven fetches. */
  userId: string | null;
  /** Target id when the fetch is scoped to a research target (§4.4 use cases). */
  targetId: string | null;
  /**
   * Fetch budget — total bytes the connector is allowed to pull in one invoke.
   * Protects against a runaway EDGAR 10-K that lacks section boundaries.
   * Defaulted by the service when omitted.
   */
  fetchBudgetBytes?: number;
}

/**
 * Generic connector result. Connectors own the DB writes (source_records +
 * source_field_values as applicable); this payload is what the service returns
 * to the caller for logging / UI surfacing.
 */
export interface ConnectorResult {
  sourceType: SourceType;
  /** UUID of the `source_records` row. Null on dedup-skip + on dry run. */
  sourceRecordId: string | null;
  /** Canonical URL recorded. Used for display + dedup parity. */
  canonicalUrl: string;
  /** Whether this invocation actually inserted a new row. */
  isNew: boolean;
  /** Bytes stored inline in source_records.content. Excludes TOASTed bytes. */
  bytes: number;
  /** Human-readable summary for logs + UI toasts. */
  summary: string;
  /** Free-form metadata — connector-specific. */
  metadata?: Record<string, unknown>;
  /** Warnings surfaced (e.g. robots blocked secondary URL) — non-fatal. */
  warnings?: string[];
}

export interface SourceConnector<TInput = unknown> {
  readonly sourceType: SourceType;
  readonly label: string;

  /**
   * Fetch + persist. Returns the connector result. Throws on unrecoverable
   * errors (HTTP 5xx after retries, invalid input). Caller is expected to
   * decide whether to retry or log.
   */
  invoke(input: TInput, ctx: ConnectorContext): Promise<ConnectorResult>;
}

// -------------------------------------------------------------------------
// Per-connector input shapes — kept in the shared types module so the service
// orchestrator and the cron endpoints can narrow the union without importing
// each connector module.
// -------------------------------------------------------------------------

export interface WaybackInput {
  /** The live URL to look up in the Wayback CDX index. */
  url: string;
  /**
   * Optional 14-digit timestamp (YYYYMMDDHHMMSS) hint. When provided the
   * connector asks the CDX API for the snapshot nearest that moment.
   */
  timestamp?: string;
  /** Skip the LinkedIn-auto-reparse side-effect even if the URL is on LinkedIn. */
  skipLinkedInReparse?: boolean;
}

export interface EdgarInput {
  /** CIK — 10-digit zero-padded, or shorter (we pad internally). */
  cik: string;
  /** Company id, required so we can match the filing back to a company row. */
  companyId: string;
  /** How many recent filings to pull. Default 3 (see §5.5 backfill policy). */
  limit?: number;
  /** If true, skip filings whose accession number we already stored. */
  dedup?: boolean;
}
