# Evidence + Provenance — How Everything Plugs Into ECC

**Scope**: The concrete wiring from WS-3 snippets and WS-5 source records into the existing ECC substrate (`causal_nodes`, `causal_edges`, `exo_chain_entries`, `cross_refs`), such that every fact in the app is auditable back to a capture, snippet, or source.
**Non-scope**: Changing ECC semantics themselves. Re-introducing engines deferred from the ECC sprint (SCEN, EMOT, RVF binary format — see `.planning/ecc-sprint/00-specification.md` §Out-of-scope).
**Cross-cutting**: This doc is NOT a workstream. It is the integration spec that WS-3 and WS-5 must follow so everything lands in the same auditable substrate.

---

## 1. Why this doc exists

The ECC sprint (completed March 2026; `.planning/ecc-sprint/`) gave us a causal graph, an append-only hash-linked event log, impulses, cognitive tick sessions, and typed cross-references. Those are exactly the primitives this sprint needs. Rebuilding any of them would be malpractice.

The challenge is that ECC was built with scoring and enrichment as its two "source events." It did not anticipate snippets or arbitrary web-source ingestion. Three questions follow:

1. How do new event kinds (snippet save, source fetch) map onto `causal_nodes.entity_type` and `causal_edges.relation` without breaking existing queries?
2. How does the ExoChain stay tamper-evident when we append entries from sources other than the enrichment waterfall?
3. How do cross-refs (from `029-ecc-cross-refs.sql`) get populated from sources like EDGAR or snippet linked-entities?

This doc answers each.

## 2. ECC primitives recap (for this doc's readers)

Cite-source from existing schema:

- `causal_nodes` (`025-ecc-causal-graph.sql`) — `(id, tenant_id, entity_type, entity_id, operation, inputs jsonb, output jsonb, session_id, created_at)`.
- `causal_edges` — `(id, source_node_id, target_node_id, relation, weight, metadata, created_at)`.
- `exo_chain_entries` (`026-ecc-exo-chain.sql`) — append-only, BLAKE3 hash-linked per chain_id.
- `impulses` (`027-ecc-impulses.sql`) — event bus for decoupled downstream.
- `research_sessions`, `session_messages` (`028-ecc-cognitive-tick.sql`) — session continuity.
- `cross_refs` (`029-ecc-cross-refs.sql`) — typed edges annotating the existing `edges` table.
- All with RLS (`030-ecc-rls.sql`).

Runtime verification runbook at `docs/development_notes/ecc/runtime-verification.md` proves writes land end-to-end.

## 3. New `entity_type` values

`causal_nodes.entity_type` is a free-form TEXT column (per the migration). We add three new values for this sprint:

| entity_type | When written | By what module |
|-------------|--------------|----------------|
| `snippet` | User saves a snippet | WS-3 snippet service |
| `source_record` | Connector fetches a new source_records row | WS-5 source service |
| `target` | Target created or target state changed | WS-4 target service |

Existing values (`score`, `dimension`, `input`, `weight`, `enrichment`, `cross_ref`) are unchanged.

### 3.1 Operation naming convention

| entity_type | operation | Written when |
|-------------|-----------|--------------|
| `snippet` | `captured` | User saves via `POST /api/extension/snippet` |
| `snippet` | `edited` | User edits tags or linked entities |
| `snippet` | `deleted` | User deletes |
| `source_record` | `fetched` | Connector fetch succeeds |
| `source_record` | `reparsed` | A Wayback snapshot of a LinkedIn page is re-parsed with current selectors |
| `source_record` | `failed_fetch` | Connector fetch fails persistently |
| `target` | `created` | New target added |
| `target` | `primary_set` | User promotes a target to primary |
| `target` | `secondary_set` | User sets a secondary target |
| `target` | `archived` | User removes the target |

## 4. New `relation` values on causal_edges

Same principle — TEXT column, append only. New values for this sprint:

| relation | From | To | Example |
|----------|------|-----|--------|
| `evidence_for` | snippet | target (contact/company/self) | Snippet node → target node: this snippet is evidence about this target. |
| `mentions` | snippet | contact or company | Snippet text mentions a person who was linked. |
| `cited_from` | snippet | source_record | Snippet cites a specific source record. |
| `fetched_from` | source_record | target | A source was fetched in the context of researching a target. |
| `identifies` | source_record | contact or company | A connector's rule-based extraction says this source is about this entity. |
| `recentered_from` | target (new primary) | target (previous primary) | Back-stack provenance on re-center. |

Each relation has a clear directional meaning, preserved in queries. No symmetric relations (bidirectionality is the query's job, not the schema's).

## 5. ExoChain integration

### 5.1 Chain boundaries

ExoChain groups by `chain_id`. Today the scoring-adapter and enrichment-adapter each form one chain per `(tenant_id, contact_id, operation)`. We add:

- **Snippet chain per target**: `chain_id = 'snippet:<target_id>'`. Every snippet saved to that target appends to the same chain. Verifying the chain proves that no snippet was silently inserted or altered.
- **Source chain per tenant**: `chain_id = 'source:<tenant_id>'`. Every source record fetch appends. One chain per tenant — a tenant's entire external-source fetch history is one verifiable chain.

Chain IDs are strings (matching the existing column type). Choosing these granularities trades write contention (many writes to the same chain serialize) against audit value (larger chains = broader invariants). For this sprint both granularities are fine; we can split chains later if contention appears.

### 5.2 Entry payload

Each ExoChain entry carries:

```
{
  operation: string,
  timestamp: iso8601,
  data: {
    causal_node_id: uuid,
    entity_type: string,
    entity_id: string,
    operation: string,
    content_hash?: bytea,        -- for snippet / source_record: hash of the actual content
    source_url?: string,
    tenant_id: uuid,
  }
}
```

`content_hash` is the key addition for this sprint. A snippet chain entry hashes the snippet body bytes; if the snippet's `causal_nodes.output.content.text` is later altered, the chain's verification breaks. The user gets a deterministic alarm.

### 5.3 Verification endpoint

Existing `/api/enrichment/chain/:chainId` is re-used. We add a lightweight "verify any chain" endpoint:

```
GET /api/ecc/exo-chain/verify/:chainId
→ { chainId, entries: N, verified: true, tamperedSequence?: number }
```

Admin page surfaces verification status for target snippet chains and the source chain.

## 6. Cross-refs — semantic edges from sources

`cross_refs` (from `029-ecc-cross-refs.sql`) annotates entries in the existing `edges` table with semantic context (`relation_type`, `context`, `source_attribution`). We populate cross_refs from source connectors in two cases:

### 6.1 Same-company co-workers from EDGAR

When EDGAR's Item 10 / DEF 14A table yields multiple executives at the same company, we create cross_refs of type `co_executive` linking them. Source attribution is `'edgar:<accession>'`.

### 6.2 Co-appearance in a news article or press release

When one press release mentions both contact A and contact B, we create a cross_ref of type `co_mentioned` with source `'news:<source_record_id>'`. Confidence scales with the RSS feed trust setting.

### 6.3 Co-mentioned inside a snippet

Snippet-derived links flow in through WS-3's `causal_edges.relation='mentions'`, not through cross_refs. Cross_refs annotate the legacy `edges` table; snippets live in the causal-graph world. These are intentionally separate — the legacy `edges` table is for structural connections; snippets are evidence about those connections.

A future consolidation (not this sprint) is to collapse `edges` + `cross_refs` + snippet-derived `causal_edges.relation='mentions'` into one queryable relationship surface. For now they coexist.

## 7. Provenance chain — worked example

Using US-1 from `00-sprint-overview.md`: "find the departed AI director."

```
 User sets Acme Inc as primary target
   → causal_node {entity_type='target', operation='created', entity_id=<target-id>}
   → causal_node {entity_type='target', operation='primary_set'}

 EDGAR backfill enqueues (§WS-5.5.5)
   → causal_node {entity_type='source_record', operation='fetched', entity_id=<10-K-accession>}
   → edge {snippet? no — source_record → target, relation='fetched_from'}
   → source_record_entities rows for each executive named in Item 10
   → optional edge {source_record → contact, relation='identifies'}
   → exo_chain_entries append under chain_id='source:<tenant_id>'

 Wayback connector fetches team page snapshot for 2024-07
   → source_record row
   → HTML is parsed through LinkedIn company parser (WS-1)
   → parse_field_outcomes rows, confidence per field
   → if yielded new contacts (the AI director!) → contacts rows insert
   → causal_node {entity_type='source_record', operation='reparsed'}
   → causal_edge {source_record → contact (AI director), relation='identifies'}

 User snips the AI director's name from a 2024-06 press release
   → snippet causal_node
   → edge {snippet → target, relation='evidence_for'}
   → edge {snippet → contact (AI director), relation='mentions'}
   → edge {snippet → source_record (press release), relation='cited_from'}
   → exo_chain_entries append under chain_id='snippet:<target-id>'

 Current Acme LinkedIn capture shows the AI director is absent
   → normal parser flow; no new contact created
   → existing contact updated with departed status (via projection reconciliation)
   → causal_node {entity_type='input', operation='presence_check'}
   → causal_edge noting the absence

 Scoring adapter fires
   → existing score computation, referencing the contact
   → if ECC_CAUSAL_GRAPH=true, writes node + edges per the existing scoring-adapter

 Result: the target dashboard shows the AI director with provenance:
   - "Found via 2024-07 Wayback snapshot (fetched_from Acme target)"
   - "Mentioned in 2024-06 press release (evidence_for Acme target)"
   - "Listed in 2023 10-K (identifies)"
   - "Absent from 2026-04 LinkedIn capture"
```

Every row of the provenance chain is queryable with a single recursive CTE over `causal_nodes` + `causal_edges` (already implemented in `getCausalGraph` at `app/src/lib/ecc/causal-graph/service.ts:118`).

## 8. Scoring with evidence

Today scoring runs over numeric signals only (contact fields). With this sprint, evidence nodes exist and can influence scoring. We do **not** rewrite the scoring pipeline for evidence-aware signals this sprint — that's a future hardening. But the substrate is here for it.

Minimal evidence signal we can add this sprint, if time permits:

- **Evidence weight dimension**: new scoring dimension `EVIDENCE_DEPTH`, defined as `log(1 + count of evidence_for edges to this target's contact)`. Simple, additive, reveals "which contacts have the most snippet evidence" — a proxy for research depth, not quality.

This is flagged with `SCORE_EVIDENCE_DEPTH=false` default; opt-in.

The causal-graph adapter already handles arbitrary dimensions — new one plugs in at `scoring-adapter.ts` with no architectural change.

## 9. Session continuity

A research session (existing `research_sessions` table) tracks a continuous stream of a user's research on a target. We populate `session_id` on all new nodes written during a session:

- Snippet saves populate `causal_nodes.session_id`.
- Source fetches performed in-session populate `session_id` (via the `SourceContext.sessionId`).
- Target switches during a session populate `session_id`.

A session "replay" query is:

```sql
SELECT * FROM causal_nodes
WHERE session_id = $1
ORDER BY created_at ASC;
```

Plus following edges. This is the thread the user walks back down the next day — useful in the main app and in the Cognitive Tick Claude adapter from `028-ecc-cognitive-tick.sql`.

## 10. Impulses that fire from this sprint

New impulse types (added to the impulse registry):

| Impulse type | Fires when | Handlers |
|--------------|-----------|----------|
| `snippet.saved` | Snippet causal_node created | Notify sidebar via WS; (future) train a recommender |
| `source.fetched` | New source_record row | Update target's sources panel; trigger reparse if kind=wayback+pageType=PROFILE |
| `target.switched` | Target state updated | Invalidate cached graph layouts; log to target_history |
| `evidence.linked` | New causal_edge relation='mentions' | Enqueue entity enrichment if the linked entity is newly created |
| `source.mismatch` | Conflict detected between sources (per §WS-5.13) | Banner on target page |

Each impulse follows the pattern from `027-ecc-impulses.sql`: producer writes an `impulses` row, one or more handlers subscribe. The existing impulse dispatcher handles delivery.

Note: the `dispatcher.ts:88` webhook branch P0 from `stub-inventory.md` is not in this sprint's path, but any impulse type we ship must not rely on the webhook handler (use `task-generator`, `campaign-enroller`, or the new handler we write per impulse type above).

## 11. Privacy + compliance

### 11.1 PII in source records

Source records are generally public content (press releases, SEC filings, news). But user-uploaded podcast transcripts or blog scrapes may contain PII. We run the existing PII scrubber on ingestion and set `source_records.metadata.pii_detected` true or false.

The scrubber does not modify content — it flags. Downstream features (export, share) honor the flag.

### 11.2 Right-to-be-forgotten

A contact can be deleted. Cascade plan:
- `contacts` delete cascades to `source_record_entities` (the link rows disappear).
- `source_records` content stays (the source content is about multiple entities).
- `causal_nodes` with entity_type='snippet' referencing the deleted contact: the mention edges are removed; the snippet itself remains but its linked-entities list no longer includes the deleted contact.

The ExoChain still verifies because entries hash the state at the time of writing; deletion doesn't mutate past entries.

### 11.3 Tenant isolation

All new tables ship with RLS policies keyed on `tenant_id`. Migration `036` mirrors the pattern from `030-ecc-rls.sql` — tenant_isolation + admin_bypass policies.

## 12. Queries the UI will run

A short library of queries that must perform well.

### 12.1 "Show provenance for this contact"

```sql
WITH RECURSIVE evidence(node_id, depth) AS (
  SELECT id, 0 FROM causal_nodes
  WHERE tenant_id = $1 AND entity_type = 'contact' AND entity_id = $2
  UNION ALL
  SELECT ce.source_node_id, depth + 1
  FROM evidence e
  JOIN causal_edges ce ON ce.target_node_id = e.node_id
  WHERE depth < 3
)
SELECT cn.* FROM causal_nodes cn JOIN evidence USING(id)
ORDER BY cn.created_at DESC;
```

Indexed on `(tenant_id, entity_type, entity_id)` (exists).

### 12.2 "Sources about this target, grouped by type"

```sql
SELECT sr.source_type, COUNT(*) AS n, MAX(sr.published_at) AS latest
FROM source_record_entities sre
JOIN source_records sr ON sr.id = sre.source_record_id
JOIN research_targets rt ON sre.entity_kind::text = rt.kind::text AND sre.entity_id =
  CASE rt.kind
    WHEN 'contact' THEN rt.contact_id
    WHEN 'company' THEN rt.company_id
    WHEN 'self' THEN rt.owner_id
  END
WHERE rt.id = $1
GROUP BY sr.source_type
ORDER BY latest DESC NULLS LAST;
```

Covered by existing indexes on `source_records(tenant_id, source_type, published_at)` and `source_record_entities` primary key.

### 12.3 "Verify snippet chain for a target"

```sql
SELECT * FROM exo_chain_entries
WHERE chain_id = 'snippet:' || $1
ORDER BY sequence ASC;
```

Existing uniqueness constraint `UNIQUE(chain_id, sequence)` (from `026`) makes this naturally ordered.

## 13. Cross-references

- `01-parser-audit.md` §4 — selector telemetry; `parse_field_outcomes` is NOT in causal_nodes (it's parser-domain data, not causal).
- `03-snippet-editor.md` §3 — snippet storage in causal_nodes.
- `04-targets-and-graph.md` §3.4 — target as causal_nodes entity.
- `05-source-expansion.md` §2 — source_records table; §4.2 Wayback reparse.
- `07-architecture-and-schema.md` — consolidated schema.
- `.planning/ecc-sprint/00-specification.md` — what ECC is and what it is not.
- `docs/development_notes/ecc/runtime-verification.md` — runbook updated to include snippet and source chain verification.
- `027-ecc-impulses.sql` — new impulse types added via data, not schema.
- `029-ecc-cross-refs.sql` — cross_refs populated from EDGAR and news co-mentions.
- `stub-inventory.md` — `DEFAULT_TENANT_ID` P0 cleared as part of WS-4; webhook handler P0 not relied on here.
