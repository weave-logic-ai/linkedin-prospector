-- Research Tools Sprint — Phase 3 Track F (WS-5 RSS + news + blog connectors)
-- Per `05-source-expansion.md` §6.2 and `08-phased-delivery.md` §5.
--
-- The source_feeds table from 036-sources-schema.sql already handles per-feed
-- polling state (last_fetched_at, last_etag, etc.). This migration adds the
-- lighter-weight source_subscriptions table that pins a feed or query to the
-- cron loop so the RSS/news/blog endpoints can enumerate what to poll without
-- re-querying each connector's config.
--
-- It also adds `blog_discovered` on companies so the blog-discovery cron can
-- skip domains it has already probed (positive or negative result).

CREATE TABLE IF NOT EXISTS source_subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  kind            TEXT NOT NULL CHECK (kind IN ('rss', 'google_news', 'blog')),
  feed_url        TEXT,
  query           TEXT,
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts(id)  ON DELETE CASCADE,
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  last_polled_at  TIMESTAMPTZ,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Exactly one of the three targeting columns is populated per row. The
  -- check enforces consistency with `kind`.
  CONSTRAINT chk_sub_exactly_one CHECK (
    (CASE WHEN feed_url   IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN query      IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN company_id IS NOT NULL AND kind = 'blog' THEN 1 ELSE 0 END) = 1
  )
);

CREATE INDEX IF NOT EXISTS ix_source_subscriptions_tenant_kind
  ON source_subscriptions(tenant_id, kind) WHERE enabled = TRUE;

CREATE INDEX IF NOT EXISTS ix_source_subscriptions_last_polled
  ON source_subscriptions(last_polled_at NULLS FIRST)
  WHERE enabled = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_source_subscriptions_rss
  ON source_subscriptions(tenant_id, feed_url)
  WHERE feed_url IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_source_subscriptions_gnews
  ON source_subscriptions(tenant_id, query)
  WHERE query IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_source_subscriptions_blog
  ON source_subscriptions(tenant_id, company_id)
  WHERE kind = 'blog' AND company_id IS NOT NULL;

CREATE TRIGGER trg_source_subscriptions_updated_at
  BEFORE UPDATE ON source_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- companies.blog_discovered guards the blog-discovery cron — once a company
-- has been probed (feed found or not), it is marked TRUE. Re-probing is a
-- manual admin operation.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS blog_discovered BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS ix_companies_blog_discovered
  ON companies(blog_discovered) WHERE blog_discovered = FALSE;
