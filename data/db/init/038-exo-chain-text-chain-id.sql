-- Research Tools Sprint — WS-3: Snippet chain_id as TEXT
-- Per ADR-029 (`docs/adr/ADR-029-exochain-snippet-chain-scope.md`), snippet
-- ExoChain entries use a string chain_id of the form:
--   chain_id = 'snippet:' || target.kind || ':' || target.id
-- Examples: 'snippet:contact:<uuid>', 'snippet:company:<uuid>', 'snippet:self:<uuid>'.
--
-- The original ECC migration (`026-ecc-exo-chain.sql`) declared chain_id as UUID.
-- That works for enrichment / scoring chains where each chain gets a random UUID
-- via crypto.randomUUID(), but it cannot store the namespaced string form.
--
-- This migration widens chain_id to TEXT. Existing UUID values coerce to their
-- canonical textual form automatically — no semantic change for existing chains.
-- The TS service (`app/src/lib/ecc/exo-chain/service.ts`) already passes chain_id
-- as a string, so no application code change is required.

ALTER TABLE exo_chain_entries
  ALTER COLUMN chain_id TYPE TEXT USING chain_id::TEXT;

-- Recreate chain index using the text column — old index auto-drops with the
-- type change on some Postgres versions; redefining is idempotent (IF NOT EXISTS).
CREATE INDEX IF NOT EXISTS idx_exo_chain_chain ON exo_chain_entries(chain_id, sequence);
