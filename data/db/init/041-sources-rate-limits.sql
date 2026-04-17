-- Research Tools Sprint — Phase 2 Track E (WS-5 Wayback + EDGAR connectors)
-- Per `05-source-expansion.md` §11 and `08-phased-delivery.md` §4.2 scope bullet
-- on "rate limiter: token bucket per host + per tenant, persisted".
--
-- Why persisted: the cron endpoints kick off fetches across invocations that can
-- outlast any in-process state. We want the token bucket to survive a process
-- restart so we never blow past `web.archive.org` / `data.sec.gov` quotas on a
-- bounce of the Next.js server.

CREATE TABLE IF NOT EXISTS source_rate_limits (
  -- Composite key: a bucket per (tenant, host). A tenant-null row models the
  -- "global" bucket for a host, applied when a cron job runs outside a tenant
  -- context. We keep per-tenant buckets so one tenant cannot starve another.
  tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
  host            TEXT NOT NULL,
  -- Bucket capacity and refill rate, both configurable per host. Seed values
  -- per §11 of 05-source-expansion.md: wayback 30/min, edgar 10/min. The
  -- connectors can call `ensureBucket` with the right numbers the first time
  -- they see a new host.
  capacity        INTEGER NOT NULL,
  refill_per_min  REAL NOT NULL,
  -- Current token count. Refills are computed lazily at acquire time based on
  -- (now() - last_refill_at) * refill_per_min / 60 seconds, capped at capacity.
  tokens          REAL NOT NULL,
  last_refill_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_acquire_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- NULL tenant_id is the global bucket — we can't use a plain PRIMARY KEY
  -- because Postgres treats NULL as distinct in PK. Work around with a
  -- partial unique index on the composite plus a second on host alone when
  -- tenant is NULL.
  CONSTRAINT uq_source_rate_limits_per_tenant UNIQUE (tenant_id, host)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_source_rate_limits_global
  ON source_rate_limits(host) WHERE tenant_id IS NULL;

CREATE TRIGGER trg_source_rate_limits_updated_at
  BEFORE UPDATE ON source_rate_limits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Robots.txt cache. Per §11: "A small library... A minimalist parse is 80 LOC."
-- Fetched robots files cached for 24h. `allow_disallow_rules` holds the parsed
-- rule pairs; `parsed_ok` guards fail-closed behavior — if parse_error is set,
-- callers treat the domain as fully disallowed until the cache entry expires.
CREATE TABLE IF NOT EXISTS source_robots_cache (
  host             TEXT PRIMARY KEY,
  fetched_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ NOT NULL,
  raw_body         TEXT,
  parsed_ok        BOOLEAN NOT NULL DEFAULT TRUE,
  parse_error      TEXT,
  -- JSON array of {userAgent, allow[], disallow[]} groups. Kept as JSONB so
  -- we can inspect and index later (e.g. find hosts that blanket-disallow all).
  rules            JSONB NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS ix_source_robots_cache_expires
  ON source_robots_cache(expires_at);
