# Architecture + Schema

**Scope**: The consolidated schema changes, new migrations (`033`–`036`), API shape, module layout, and ADRs that land as a result of this sprint.
**Cross-refs**: Each section cites the WS doc that owns its motivation.

---

## 1. Migration order

Existing migrations stop at `032-knowledge-schema.sql`. New migrations, in order:

| # | File | Owner WS | Adds |
|---|------|---------|------|
| 033 | `data/db/init/033-parse-telemetry.sql` | WS-1 | `parse_field_outcomes`, `parser_regression_reports`, `selector_config_audit` |
| 034 | `data/db/init/034-snippets-schema.sql` | WS-3 | `snippet_blobs`, `snippet_tags` (no `snippets` table — snippets are `causal_nodes` rows) |
| 035 | `data/db/init/035-targets-schema.sql` | WS-4 | `research_targets`, `research_target_state`, `research_target_icps`, `target_history`, `research_lenses` |
| 036 | `data/db/init/036-sources-schema.sql` | WS-5 | `source_records`, `source_record_entities`, `source_feeds`, `source_ingestion_jobs` |
| 037 | `data/db/init/037-research-rls.sql` | cross | RLS policies for all the new tables |

Migrations are additive — none drops or alters an existing `001`–`032` table except:

- `035` adds a `source TEXT NOT NULL DEFAULT 'linkedin'` column to `page_cache` to distinguish LinkedIn captures from Wayback-replayed captures.
- `035` adds `last_parser_version TEXT` to `contacts` (for re-parse targeting per WS-1 §4.5).
- `035` adds `cik TEXT` to `companies` (for EDGAR matching per WS-5).

All existing INSERT/UPDATE paths are backward-compatible.

### 1.1 RLS pattern

Every new table keys on `tenant_id UUID NOT NULL REFERENCES tenants(id)`. RLS enabled with two policies per table (matching `030-ecc-rls.sql`):

```sql
CREATE POLICY tenant_isolation_<table> ON <table>
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY admin_bypass_<table> ON <table>
  TO admin_role USING (true);
```

Junction tables (`research_target_icps`, `source_record_entities`) inherit via the parent row's tenant_id + a JOIN-based policy.

## 2. Table schemas — full

### 2.1 WS-1 — `parse_field_outcomes`, `parser_regression_reports`, `selector_config_audit`

```sql
-- data/db/init/033-parse-telemetry.sql

CREATE TABLE parse_field_outcomes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  capture_id      UUID NOT NULL REFERENCES page_cache(id) ON DELETE CASCADE,
  page_type       TEXT NOT NULL,
  parser_version  TEXT NOT NULL,
  selector_config_version INT NOT NULL,
  field_name      TEXT NOT NULL,
  value_present   BOOLEAN NOT NULL,
  confidence      REAL,
  source          TEXT NOT NULL,    -- 'selector' | 'heuristic' | 'content-heuristic' | 'title-tag' | 'url-slug' | 'fallback'
  selector_used   TEXT,
  selector_index  INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_pfo_page_field_time ON parse_field_outcomes(page_type, field_name, created_at DESC);
CREATE INDEX ix_pfo_capture ON parse_field_outcomes(capture_id);
CREATE INDEX ix_pfo_tenant_time ON parse_field_outcomes(tenant_id, created_at DESC);

CREATE TABLE parser_regression_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  capture_id      UUID NOT NULL REFERENCES page_cache(id) ON DELETE CASCADE,
  reporter_user_id UUID,
  page_type       TEXT NOT NULL,
  dom_path        TEXT NOT NULL,
  text_preview    TEXT,
  user_note       TEXT,
  redacted_fragment_path TEXT,       -- path under data/parser-fixtures/_pending
  github_issue_url TEXT,
  status          TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'promoted' | 'dismissed'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_prr_tenant_status ON parser_regression_reports(tenant_id, status, created_at DESC);

CREATE TABLE selector_config_audit (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id),
  selector_config_id UUID NOT NULL REFERENCES selector_configs(id) ON DELETE CASCADE,
  actor_id           UUID,
  change_type        TEXT NOT NULL,           -- 'create' | 'update' | 'deactivate'
  change_reason      TEXT,
  diff               JSONB NOT NULL,           -- { added: {...}, removed: {...}, changed: {...} }
  effective_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_sca_config_time ON selector_config_audit(selector_config_id, effective_at DESC);

-- Retention policy applied via a future cron job:
--   DELETE FROM parse_field_outcomes WHERE created_at < now() - interval '90 days';
```

### 2.2 WS-3 — `snippet_blobs`, `snippet_tags`

```sql
-- data/db/init/034-snippets-schema.sql

CREATE TABLE snippet_blobs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  mime_type    TEXT NOT NULL,
  byte_length  INTEGER NOT NULL CHECK (byte_length <= 1048576),  -- 1 MB cap
  sha256       BYTEA NOT NULL,
  data         BYTEA NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_snippet_blobs_sha UNIQUE (tenant_id, sha256)
);

CREATE TABLE snippet_tags (
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  slug        TEXT NOT NULL,
  label       TEXT NOT NULL,
  parent_slug TEXT,
  is_seeded   BOOLEAN NOT NULL DEFAULT FALSE,
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, slug)
);

-- GIN on causal_nodes JSONB to accelerate tag queries
CREATE INDEX ix_causal_nodes_snippet_tags
  ON causal_nodes USING GIN ((output -> 'tags'))
  WHERE entity_type = 'snippet';

-- GIN on (entity_type, entity_id) for snippet lookups
CREATE INDEX ix_causal_nodes_entity_pair
  ON causal_nodes(entity_type, entity_id)
  WHERE entity_type IN ('snippet', 'source_record', 'target');
```

### 2.3 WS-4 — targets

```sql
-- data/db/init/035-targets-schema.sql

-- Adds to page_cache
ALTER TABLE page_cache ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'linkedin';
CREATE INDEX IF NOT EXISTS ix_page_cache_source ON page_cache(source);

-- Adds to contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_parser_version TEXT;

-- Adds to companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS cik TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_companies_cik ON companies(cik) WHERE cik IS NOT NULL;

CREATE TABLE research_targets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id),
  kind           TEXT NOT NULL CHECK (kind IN ('self', 'contact', 'company')),
  owner_id       UUID REFERENCES owner_profiles(id) ON DELETE SET NULL,
  contact_id     UUID REFERENCES contacts(id) ON DELETE SET NULL,
  company_id     UUID REFERENCES companies(id) ON DELETE SET NULL,
  label          TEXT NOT NULL,
  pinned         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_target_exactly_one CHECK (
    (CASE WHEN owner_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN contact_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN company_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  ),
  CONSTRAINT chk_target_kind_match CHECK (
    (kind = 'self' AND owner_id IS NOT NULL) OR
    (kind = 'contact' AND contact_id IS NOT NULL) OR
    (kind = 'company' AND company_id IS NOT NULL)
  )
);
CREATE INDEX ix_targets_tenant_lastused ON research_targets(tenant_id, last_used_at DESC);
CREATE UNIQUE INDEX uq_target_owner   ON research_targets(tenant_id, owner_id)   WHERE owner_id IS NOT NULL;
CREATE UNIQUE INDEX uq_target_contact ON research_targets(tenant_id, contact_id) WHERE contact_id IS NOT NULL;
CREATE UNIQUE INDEX uq_target_company ON research_targets(tenant_id, company_id) WHERE company_id IS NOT NULL;

CREATE TABLE research_target_state (
  tenant_id            UUID NOT NULL REFERENCES tenants(id),
  user_id              UUID,
  primary_target_id    UUID REFERENCES research_targets(id) ON DELETE SET NULL,
  secondary_target_id  UUID REFERENCES research_targets(id) ON DELETE SET NULL,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE research_target_icps (
  target_id       UUID NOT NULL REFERENCES research_targets(id) ON DELETE CASCADE,
  icp_profile_id  UUID NOT NULL REFERENCES icp_profiles(id) ON DELETE CASCADE,
  is_default      BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (target_id, icp_profile_id)
);

CREATE TABLE target_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  user_id         UUID,
  target_id       UUID NOT NULL REFERENCES research_targets(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('primary', 'secondary')),
  switched_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  switched_from   UUID,
  switch_source   TEXT NOT NULL
);
CREATE INDEX ix_target_history_user_time ON target_history(tenant_id, user_id, switched_at DESC);

CREATE TABLE research_lenses (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id),
  user_id              UUID,
  name                 TEXT NOT NULL,
  primary_target_id    UUID REFERENCES research_targets(id) ON DELETE SET NULL,
  secondary_target_id  UUID REFERENCES research_targets(id) ON DELETE SET NULL,
  config               JSONB NOT NULL DEFAULT '{}',
  is_default           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_lenses_tenant_user ON research_lenses(tenant_id, user_id);

CREATE OR REPLACE VIEW v_research_target AS
  SELECT rt.*,
    CASE rt.kind
      WHEN 'self'    THEN op.label
      WHEN 'contact' THEN c.full_name
      WHEN 'company' THEN co.name
    END AS resolved_label,
    CASE rt.kind
      WHEN 'self'    THEN op.avatar_url
      WHEN 'contact' THEN c.profile_image_url
      WHEN 'company' THEN co.logo_url
    END AS avatar_url
  FROM research_targets rt
    LEFT JOIN owner_profiles op ON op.id = rt.owner_id
    LEFT JOIN contacts c ON c.id = rt.contact_id
    LEFT JOIN companies co ON co.id = rt.company_id;
```

### 2.4 WS-5 — sources

```sql
-- data/db/init/036-sources-schema.sql

CREATE TABLE source_records (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id),
  source_type    TEXT NOT NULL,
  source_id      TEXT NOT NULL,
  canonical_url  TEXT NOT NULL,
  title          TEXT,
  published_at   TIMESTAMPTZ,
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  content_hash   BYTEA NOT NULL,
  content_bytes  INTEGER NOT NULL,
  content        BYTEA,
  content_mime   TEXT,
  metadata       JSONB NOT NULL DEFAULT '{}',
  status         TEXT NOT NULL DEFAULT 'fetched',
  CONSTRAINT uq_source_dedup UNIQUE (tenant_id, source_type, source_id)
);
CREATE INDEX ix_sr_tenant_url ON source_records(tenant_id, canonical_url);
CREATE INDEX ix_sr_tenant_type_pub ON source_records(tenant_id, source_type, published_at DESC);
CREATE INDEX ix_sr_tenant_hash ON source_records(tenant_id, content_hash);

CREATE TABLE source_record_entities (
  source_record_id UUID NOT NULL REFERENCES source_records(id) ON DELETE CASCADE,
  entity_kind      TEXT NOT NULL CHECK (entity_kind IN ('contact','company')),
  entity_id        UUID NOT NULL,
  role             TEXT NOT NULL,
  confidence       REAL NOT NULL DEFAULT 1.0,
  extracted_by     TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (source_record_id, entity_kind, entity_id, role)
);
CREATE INDEX ix_sre_entity ON source_record_entities(entity_kind, entity_id);

CREATE TABLE source_feeds (
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
  CONSTRAINT uq_source_feeds UNIQUE (tenant_id, feed_url)
);

CREATE TABLE source_ingestion_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  source_type     TEXT NOT NULL,
  payload         JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'queued',
  attempts        INT NOT NULL DEFAULT 0,
  last_error      TEXT,
  scheduled_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  CONSTRAINT chk_sij_status CHECK (status IN ('queued','running','done','failed','retrying'))
);
CREATE INDEX ix_sij_status_scheduled ON source_ingestion_jobs(status, scheduled_at);
```

### 2.5 `037-research-rls.sql`

Mirrors `030-ecc-rls.sql`. Enables RLS on all 14 new tables and creates tenant_isolation + admin_bypass policies. Junction tables use row-level policies that join the parent (e.g. `source_record_entities` checks the parent `source_records.tenant_id`).

## 3. API inventory

### 3.1 Parser / telemetry (WS-1 + WS-2)

```
GET    /api/parser/yield-report                            # admin dashboard feed
GET    /api/parser/yield-report/:pageType/:field           # per-field series
POST   /api/parser/regression-report                       # from sidebar
GET    /api/parser/regression-reports                      # admin list
POST   /api/parser/reparse/:captureId                      # reparse a cached page

GET    /api/extension/capture/:captureId/result            # sidebar polling
GET    /api/extension/entity/:type/:id/diff?since=<id>     # sidebar diff panel

GET    /api/admin/selector-configs                         # list active configs
GET    /api/admin/selector-configs/:id/audit               # history
```

### 3.2 Snippets (WS-3)

```
POST   /api/extension/snippet                              # save
GET    /api/targets/:id/snippets                           # list for target
GET    /api/snippets/:id                                   # single
DELETE /api/snippets/:id                                   # soft delete (causal_nodes entry)
POST   /api/snippets/:id/tags                              # add tags
DELETE /api/snippets/:id/tags/:slug                        # remove tag
POST   /api/snippets/:id/entities                          # add linked entity
DELETE /api/snippets/:id/entities/:entityId                # remove
GET    /api/snippet-tags                                   # taxonomy
POST   /api/snippet-tags                                   # user-added tag

GET    /api/extension/contact/search                       # resolver for mentions
GET    /api/extension/company/search                       # resolver for mentions
```

### 3.3 Targets (WS-4)

```
GET    /api/targets
POST   /api/targets
GET    /api/targets/:id
PATCH  /api/targets/:id
DELETE /api/targets/:id
GET    /api/targets/state
PUT    /api/targets/state
GET    /api/targets/:id/history
GET    /api/targets/state/history
GET    /api/targets/:id/icp-profiles
POST   /api/targets/:id/icp-profiles
DELETE /api/targets/:id/icp-profiles/:icpId

GET    /api/lenses
POST   /api/lenses
PUT    /api/lenses/:id
DELETE /api/lenses/:id
```

### 3.4 Sources (WS-5)

```
GET    /api/sources
POST   /api/sources/wayback                                # fetch by URL + optional ts
POST   /api/sources/edgar/filings                          # backfill for cik
POST   /api/sources/rss                                    # add feed
GET    /api/sources/:id
GET    /api/sources/:id/content                            # raw body (signed short-lived url if external)
GET    /api/targets/:id/sources                            # target rollup

POST   /api/cron/wayback-seed                              # job runner
POST   /api/cron/edgar-backfill
POST   /api/cron/rss-poll
POST   /api/cron/news-poll
```

### 3.5 ECC surface (additive, per WS-6/evidence)

```
GET    /api/ecc/exo-chain/verify/:chainId                  # verify any chain
GET    /api/contacts/:id/provenance                        # recursive CTE over causal_nodes
GET    /api/companies/:id/provenance
GET    /api/targets/:id/provenance
```

## 4. Module layout

```
app/src/lib/
  parser/                     (existing — extended per WS-1)
    fallbacks/                (NEW)
    unmatched-dom.ts          (NEW)
    telemetry.ts              (NEW)
  projections/                (NEW — WS-2)
    contact.ts
    company.ts
    self.ts
    diff.ts
  snippets/                   (NEW — WS-3)
    service.ts
    entity-resolver.ts
    blob-store.ts
    validation.ts
    hash.ts
  targets/                    (NEW — WS-4)
    service.ts
    history.ts
    lens.ts
  sources/                    (NEW — WS-5)
    types.ts
    registry.ts
    service.ts
    rate-limit.ts
    robots.ts
    connectors/
      wayback.ts
      edgar.ts
      rss.ts
      news.ts
      blog.ts
      podcast.ts
    scrapers/
      wsj.ts
      bloomberg.ts
      reuters.ts
      techcrunch.ts
      cnbc.ts
  ecc/
    causal-graph/             (existing)
    evidence/                 (NEW — tiny, just adapters for this sprint's new entity_types)
      snippet-adapter.ts
      source-adapter.ts
      target-adapter.ts
```

## 5. Feature flags

Mirroring the `ECC_*` pattern from `docker-compose.yml`:

```env
RESEARCH_PARSER_TELEMETRY=false            # WS-1
RESEARCH_SIDEBAR_PANELS=false              # WS-2
RESEARCH_SNIPPETS=false                    # WS-3
RESEARCH_TARGETS=false                     # WS-4 (master switch)
RESEARCH_SOURCE_WAYBACK=false              # WS-5 per-connector flags
RESEARCH_SOURCE_EDGAR=false
RESEARCH_SOURCE_RSS=false
RESEARCH_SOURCE_NEWS=false
RESEARCH_SOURCE_BLOG=false
RESEARCH_SOURCE_PODCAST=false
```

All default false. Turning them all on restores the designed behavior; turning them all off restores pre-sprint behavior (except the new DB tables, which are empty and harmless).

Adapters check flags on each call and short-circuit to pass-through behavior. No config required for the no-op path.

## 6. ADRs this sprint records

| ADR | Decision |
|-----|----------|
| ADR-027 | Snippets live as `causal_nodes` with `entity_type='snippet'`, not a dedicated table. |
| ADR-028 | All external-source fetches go through `source_records` with `(tenant_id, source_type, source_id)` unique dedup. |
| ADR-029 | Target state is server-persisted per `(tenant_id, user_id)`; tabs have local primary for concurrency. |
| ADR-030 | Chrome extension uses `optional_host_permissions` with on-demand per-origin request, never `<all_urls>` at install. |
| ADR-031 | Selector telemetry is retained raw for 90 days; aggregated indefinitely. |
| ADR-032 | ExoChain chain_id granularity: `snippet:<target_id>` per target, `source:<tenant_id>` per tenant. |
| ADR-033 | Source conflict resolution order defaults to `edgar > press_release > news > linkedin > blog > podcast > wayback`, per-tenant configurable. |

Each ADR becomes a 1-page file under `docs/adr/ADR-0{NN}.md` when implementation begins.

## 7. Testing strategy

- WS-1 fixtures: golden snapshots under `tests/parser/__snapshots__/`. Committed.
- WS-2 endpoints: integration tests hitting a test DB seeded with fixtures.
- WS-3 service: unit tests for entity resolution, blob dedup, validation; integration test for end-to-end save.
- WS-4 target state: unit tests for migration (existing owner → target); integration tests for state transitions.
- WS-5 connectors: each connector has a unit test with a fixture HTML/XML response; an integration test against each connector's rate-limited sandbox (Wayback's API, SEC's submissions API — both free and safe to hit from CI with a limit guard).
- Cross-cutting: an end-to-end test that replays US-1 from `00-sprint-overview.md` (Wayback snapshot + EDGAR filing + manual snippet ⇒ target dashboard shows the expected provenance).

## 8. Performance budgets

| Operation | Budget |
|-----------|--------|
| Parse a profile page (end-to-end, inc. telemetry) | ≤ 400 ms p95 on fixture data |
| Sidebar `GET /result` call | ≤ 150 ms p95 server-side |
| `GET /diff` endpoint for a contact | ≤ 250 ms p95 |
| Snippet save round-trip | ≤ 500 ms p95 (excluding blob upload) |
| Target state update | ≤ 100 ms p95 |
| Graph re-center (client-observed) | ≤ 200 ms p95 |
| Source record insert | ≤ 300 ms p95 |
| Chain verify endpoint | ≤ 1 s for chains up to 1000 entries |

Measured via existing Next.js request logs; new lightweight latency-metric endpoint surfaces p50/p95/p99 per route.

## 9. Rollout plan

See `08-phased-delivery.md` for the phase ordering. Each phase ships behind its flags; QA flips them on per phase.

## 10. Known pre-existing issues this sprint addresses or touches

From `docs/development_notes/stub-inventory.md`:

- P0 `DEFAULT_TENANT_ID='default'` in `scoring-adapter.ts:7` — cleared by WS-4's target-state tenant plumbing.
- P0 `dispatcher.ts:88` webhook handler — NOT fixed this sprint, but none of the new impulses depend on it.
- P2 silent catches on UI pages (`tasks/page.tsx`, `outreach/page.tsx`, etc.) — NOT in scope.
- P2 `ws-server.ts:34` dead pong — fixed as part of WS-2's WebSocket path.
- P2 silent catch at `parse-engine.ts:165` — fixed as part of WS-1's telemetry path.

## 11. Bill of materials

| Area | Net-new LOC estimate |
|------|---------------------|
| WS-1 parser audit + telemetry | ~1750 |
| WS-2 visibility + feedback | ~1850 |
| WS-3 snippets | ~4000 |
| WS-4 targets + graph | ~2800 |
| WS-5 source expansion | ~5400 |
| Cross-cutting ECC adapters | ~600 |
| Tests | ~3500 |
| Docs (ADRs, runbooks, sidebar mdx updates) | ~800 |

Total: ~20,700 LOC. Call it 20k–25k including iteration. Delivered over the phases in `08-phased-delivery.md`.
