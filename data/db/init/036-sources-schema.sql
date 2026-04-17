-- Research Tools Sprint — WS-5: Source expansion beyond LinkedIn
-- Per `07-architecture-and-schema.md` §2.4 and `05-source-expansion.md` §§2, 13.
-- User decision Q5 (`10-decisions.md`): conflict resolution is composite —
--   final_weight = source_type_weights.category_default × source_field_values.per_item_multiplier
-- which is materialized as a stored generated column on source_field_values.

-- -------------------------------------------------------------------------
-- source_records — every ingested external document
-- -------------------------------------------------------------------------
-- Dedup by (tenant_id, source_type, source_id). Connectors form a stable
-- source_id per source type (see 05-source-expansion.md §12). Content is
-- stored inline as bytea with a 5 MB soft cap enforced by the connector
-- (Postgres TOAST keeps on-row size reasonable; we still prefer external
-- storage for very large bodies in a future migration).
CREATE TABLE IF NOT EXISTS source_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  source_type   TEXT NOT NULL,
  -- Stable external identifier. Shape varies per source_type:
  --   wayback:  '<14-digit-timestamp>:<normalized-url>'
  --   edgar:    '<accession-number>'
  --   rss/news: '<feed-url>::<guid>'
  --   blog:     '<domain>:<canonical-path>'
  --   podcast:  '<feed-url>::<guid>' or '<listen-notes-episode-id>'
  source_id     TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  title         TEXT,
  published_at  TIMESTAMPTZ,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  content_hash  BYTEA NOT NULL,
  content_bytes INTEGER NOT NULL,
  content       BYTEA,
  content_mime  TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'fetched'
    CHECK (status IN ('pending', 'fetched', 'stored_partial', 'failed', 'stale')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_source_records_dedup UNIQUE (tenant_id, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS ix_sr_tenant_url
  ON source_records(tenant_id, canonical_url);
CREATE INDEX IF NOT EXISTS ix_sr_tenant_type_pub
  ON source_records(tenant_id, source_type, published_at DESC);
CREATE INDEX IF NOT EXISTS ix_sr_tenant_hash
  ON source_records(tenant_id, content_hash);

CREATE TRIGGER trg_source_records_updated_at
  BEFORE UPDATE ON source_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -------------------------------------------------------------------------
-- source_record_entities — connector-extracted entity links
-- -------------------------------------------------------------------------
-- Populated automatically for high-confidence matches (e.g. EDGAR filer CIK
-- matches a company row) and incrementally by users via the snippet widget
-- confirming mentions.
CREATE TABLE IF NOT EXISTS source_record_entities (
  source_record_id UUID NOT NULL REFERENCES source_records(id) ON DELETE CASCADE,
  entity_kind      TEXT NOT NULL CHECK (entity_kind IN ('contact', 'company')),
  entity_id        UUID NOT NULL,
  role             TEXT NOT NULL,
  confidence       REAL NOT NULL DEFAULT 1.0
    CHECK (confidence >= 0.0 AND confidence <= 1.0),
  extracted_by     TEXT NOT NULL
    CHECK (extracted_by IN ('connector-rule', 'user-link', 'llm-future')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (source_record_id, entity_kind, entity_id, role)
);

CREATE INDEX IF NOT EXISTS ix_sre_entity
  ON source_record_entities(entity_kind, entity_id);

-- -------------------------------------------------------------------------
-- source_feeds — subscribed RSS/Atom feeds
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS source_feeds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  source_type     TEXT NOT NULL,
  feed_url        TEXT NOT NULL,
  feed_kind       TEXT,
  label           TEXT,
  last_fetched_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_etag       TEXT,
  last_modified   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_source_feeds UNIQUE (tenant_id, feed_url)
);

CREATE INDEX IF NOT EXISTS ix_source_feeds_tenant_kind
  ON source_feeds(tenant_id, feed_kind);

CREATE TRIGGER trg_source_feeds_updated_at
  BEFORE UPDATE ON source_feeds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -------------------------------------------------------------------------
-- source_ingestion_jobs — queued/running async fetches
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS source_ingestion_jobs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  source_type  TEXT NOT NULL,
  payload      JSONB NOT NULL,
  status       TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'done', 'failed', 'retrying')),
  attempts     INT NOT NULL DEFAULT 0,
  last_error   TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_sij_status_scheduled
  ON source_ingestion_jobs(status, scheduled_at);
CREATE INDEX IF NOT EXISTS ix_sij_tenant
  ON source_ingestion_jobs(tenant_id, status, scheduled_at);

-- -------------------------------------------------------------------------
-- source_type_weights — per-category default trust weights
-- -------------------------------------------------------------------------
-- Per Q5, default ordering is edgar > press_release > news > linkedin > blog
-- > podcast > wayback. Weights are multiplicative and live per-tenant so
-- admins can tune them. Seed values below are applied to every existing
-- tenant (and we expect tenant onboarding to copy them for new tenants).
CREATE TABLE IF NOT EXISTS source_type_weights (
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  source_type      TEXT NOT NULL,
  category_default REAL NOT NULL
    CHECK (category_default >= 0.0 AND category_default <= 2.0),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, source_type)
);

CREATE TRIGGER trg_source_type_weights_updated_at
  BEFORE UPDATE ON source_type_weights
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed defaults for the 7 source types (Q5 / §13.2). Higher = more trusted.
-- Anchor: linkedin = 1.0. Other categories are fractions/multiples of that.
INSERT INTO source_type_weights (tenant_id, source_type, category_default, notes)
SELECT t.id, v.source_type, v.category_default, v.notes
FROM tenants t
CROSS JOIN (
  VALUES
    ('edgar',         1.40, 'Legally attested filings outrank everything.'),
    ('press_release', 1.20, 'Issuer-authored; directly attributable.'),
    ('news',          1.10, 'Vetted editorial; third-party.'),
    ('linkedin',      1.00, 'Baseline — user-authored profile content.'),
    ('blog',          0.90, 'Self-published, variable rigor.'),
    ('podcast',       0.80, 'Oral; transcription fidelity varies.'),
    ('wayback',       0.70, 'Historical; may be stale by construction.')
) AS v(source_type, category_default, notes)
ON CONFLICT (tenant_id, source_type) DO NOTHING;

-- -------------------------------------------------------------------------
-- source_field_values — per-field values extracted from a source_record
-- -------------------------------------------------------------------------
-- One row per (record, subject, field). Carries the weight multiplier for
-- that specific extraction (viral content, engagement signals, manual
-- override, etc.) and a stored generated `final_weight` column computed at
-- write time as category_default × per_item_multiplier.
--
-- NB on the generated column: Postgres STORED generated columns may only
-- reference columns on the SAME row, so we cannot join to source_type_weights
-- inside the generation expression. Instead the ingestion path writes the
-- relevant `category_default_snapshot` into each row and the generated
-- column multiplies the two local columns. Callers that want a live-lookup
-- value can compute it in SQL by joining source_type_weights at read time.
CREATE TABLE IF NOT EXISTS source_field_values (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  UUID NOT NULL REFERENCES tenants(id),
  source_record_id           UUID NOT NULL REFERENCES source_records(id) ON DELETE CASCADE,
  subject_kind               TEXT NOT NULL CHECK (subject_kind IN ('contact', 'company')),
  subject_id                 UUID NOT NULL,
  field_name                 TEXT NOT NULL,
  field_value                JSONB NOT NULL,
  referenced_date            TIMESTAMPTZ,
  -- Snapshot of source_type_weights.category_default at write time.
  -- Required for the generated final_weight; writers should keep this in
  -- sync when admins retune weights (a backfill job is a future item).
  category_default_snapshot  REAL NOT NULL DEFAULT 1.0
    CHECK (category_default_snapshot >= 0.0),
  -- Derived from per-item signals (engagement score, citation count, manual
  -- override, etc.). 1.0 = no boost; >1.0 = promote; <1.0 = demote.
  per_item_multiplier        REAL NOT NULL DEFAULT 1.0
    CHECK (per_item_multiplier >= 0.0),
  final_weight               REAL GENERATED ALWAYS AS
    (category_default_snapshot * per_item_multiplier) STORED,
  extracted_by               TEXT NOT NULL
    CHECK (extracted_by IN ('connector-rule', 'user-link', 'llm-future', 'user-override')),
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_sfv_record_subject_field UNIQUE (source_record_id, subject_kind, subject_id, field_name)
);

CREATE INDEX IF NOT EXISTS ix_sfv_subject_field
  ON source_field_values(subject_kind, subject_id, field_name);
CREATE INDEX IF NOT EXISTS ix_sfv_tenant_subject
  ON source_field_values(tenant_id, subject_kind, subject_id);
-- Index on final_weight to support "top N values by trust" reads during
-- the conflict-resolution projection pass.
CREATE INDEX IF NOT EXISTS ix_sfv_subject_weight
  ON source_field_values(subject_kind, subject_id, field_name, final_weight DESC);

CREATE TRIGGER trg_source_field_values_updated_at
  BEFORE UPDATE ON source_field_values
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
