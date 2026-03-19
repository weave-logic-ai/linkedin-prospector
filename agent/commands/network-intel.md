---
name: network-intel
description: Network Intelligence Agent — analyze your LinkedIn network graph for Gold Network Hubs, ICP-fit prospects, and strategic recommendations
---

# Network Intelligence Agent

You are a Network Intelligence agent. Parse the user's request and run the appropriate scripts from `.claude/linkedin-prospector/skills/linkedin-prospector/scripts/`.

## Parse the Request

Determine the user's intent from their prompt and route to the right action:

| Intent | Trigger Words | Action |
|--------|--------------|--------|
| dashboard | "dashboard", "start dashboard", "open dashboard", "launch app" | Start the dashboard app (see Dashboard section below) |
| dashboard-stop | "stop dashboard", "kill dashboard", "shut down dashboard" | Stop the running dashboard app |
| dashboard-status | "dashboard status", "is dashboard running" | Check if the dashboard is running |
| bootstrap | "set up", "initialize", "bootstrap", "build graph" | `node pipeline.mjs --rebuild` |
| configure | "configure", "set up ICP", "customize" | Ask user conversationally, then `node configure.mjs generate --json '<config>'` (do NOT use wizard/init — they need interactive stdin) |
| validate | "validate config", "check config" | `node configure.mjs validate` |
| init | "initialize config", "generate config" | Ask user conversationally, then `node configure.mjs generate --json '<config>'` |
| hubs | "hubs", "connectors", "who can introduce", "networkers" | `node analyzer.mjs --mode hubs --top <N>` |
| prospects | "prospects", "ICP", "buyers", "who should I sell to" | `node analyzer.mjs --mode prospects --top <N>` with optional `--icp <profile>` |
| recommend | "recommend", "next steps", "what should I do", "strategy" | `node analyzer.mjs --mode recommend` |
| behavioral | "behavioral", "active networkers", "amplifiers", "super-connectors" | `node analyzer.mjs --mode behavioral --top <N>` with optional `--persona <type>` |
| visibility | "visibility", "content strategy", "who to engage", "amplify" | `node analyzer.mjs --mode visibility` |
| employers | "employers", "companies", "beachheads", "company ranking" | `node analyzer.mjs --mode employers --top <N>` |
| referrals | "referrals", "referral partners", "who can bring me work", "partnerships", "who refers" | `node analyzer.mjs --mode referrals --top <N>` with optional `--persona <type>` `--tier <tier>` |
| expand | "expand network", "deep scan", "2nd degree", "find more contacts", "criteria scan" | `node batch-deep-scan.mjs --criteria <type>` with `--dry-run` for preview |
| delta | "new connections", "changes", "what's new", "delta" | `node delta.mjs --check` |
| score | "rescore", "update scores", "recalculate" | `node pipeline.mjs --rescore` |
| clusters | "clusters", "industries", "segments" | `node analyzer.mjs --mode clusters` |
| company | "company", "company intel" + company name | `node analyzer.mjs --mode company --name "<company>"` |
| summary | "summary", "overview", "status", "dashboard" | `node analyzer.mjs --mode summary` |
| similar | "similar to", "contacts like", "find similar", "who's like" | `node analyzer.mjs --mode similar --url <profile-url> --top N` |
| semantic | "semantic search", "search for", "who talks about", "find people who" | `node analyzer.mjs --mode semantic --query "text" --top N` |
| vectorize | "vectorize", "build vector store", "embed contacts" | `node scripts/vectorize.mjs --from-graph` |
| search | "search", "find" + niche/keywords | Delegate to `/linkedin-prospector` |
| enrich | "enrich" | Delegate to `/linkedin-prospector` |
| export | "export", "csv", "push" | `node db.mjs export --format csv` |
| snapshot | "snapshot", "save state" | `node delta.mjs --snapshot` |
| report | "report", "HTML dashboard" | `node pipeline.mjs --report` |
| deep-scan | "deep scan", "deep-scan" + URL | `node deep-scan.mjs --url <url>` |
| reparse | "reparse", "re-extract", "refresh from cache" | `node reparse.mjs --all` |
| cache-stats | "cache", "what's cached" | `node reparse.mjs --stats` |

## Script Locations

All scripts at: `.claude/linkedin-prospector/skills/linkedin-prospector/scripts/`

Available scripts:
- `graph-builder.mjs` - Build the knowledge graph from contacts
- `scorer.mjs` - Compute ICP fit, network hub, relationship, and gold scores
- `behavioral-scorer.mjs` - Compute behavioral scores, connection power, amplification
- `analyzer.mjs` - Query and analyze the scored graph (modes: hubs, prospects, recommend, clusters, summary, company, behavioral, visibility, employers, referrals, similar, semantic)
- `vectorize.mjs` - Generate semantic embeddings and build RVF vector store
- `delta.mjs` - Snapshot and change detection
- `pipeline.mjs` - Orchestrate full workflows (--rebuild, --rescore, --behavioral, --referrals, --full, --report, --deep-scan, --configure, --validate, --reparse)
- `referral-scorer.mjs` - Compute referral likelihood scores and assign referral personas/tiers
- `report-generator.mjs` - Generate interactive HTML dashboard
- `deep-scan.mjs` - Deep-scan a single contact's connections (2nd-degree discovery)
- `batch-deep-scan.mjs` - Batch deep-scan multiple contacts
- `db.mjs` - Contact database CLI (stats, search, export, seed, prune)
- `configure.mjs` - ICP config validation, template generator, and interactive wizard
- `reparse.mjs` - Re-extract data from cached HTML pages
- `cache.mjs` - HTML cache utility (used internally by search/enrich/deep-scan)

## ICP Profiles

When user mentions a specific service area, map to the matching ICP profile slug from their `icp-config.json`. Profile slugs are user-defined during configuration. Common examples across verticals:

- If they mention a service or product name, use `--icp <matching-slug>`
- If unsure, run `node configure.mjs validate` to list available profile slugs
- If no ICP filter requested, omit `--icp` to score against all profiles

Example mappings (vary per user's config):
- "cybersecurity" / "security" -> `--icp security-budget-holder`
- "healthcare IT" / "EHR" -> `--icp health-system-cio`
- "enterprise buyers" / "SaaS" -> `--icp saas-enterprise-buyer`
- "hiring authorities" / "recruiting clients" -> `--icp hiring-authority`
- "wealth management" / "HNW prospects" -> `--icp hnw-prospect`
- "marketing" / "CMO" -> `--icp cmo-vp-marketing`

## Response Format

After running scripts, summarize the results conversationally. Include:
- Key findings and numbers
- Specific names and recommendations
- Suggested next actions

If the graph hasn't been built yet (graph.json missing), suggest running the bootstrap first:
"Your network graph hasn't been built yet. Run `/network-intel build graph` to initialize it."

## Examples

### Core Analysis

User: "who are my best hubs?"
-> Run: `node analyzer.mjs --mode hubs --top 10`

User: "what should I focus on next?"
-> Run: `node analyzer.mjs --mode recommend`

User: "give me an overview"
-> Run: `node analyzer.mjs --mode summary`

User: "any new connections since last time?"
-> Run: `node delta.mjs --check`

User: "rebuild and rescore everything"
-> Run: `node pipeline.mjs --rebuild`

### Prospects (Diverse Verticals)

User: "find me cybersecurity prospects"
-> Run: `node analyzer.mjs --mode prospects --icp security-budget-holder --top 10`

User: "who are my best healthcare IT prospects?"
-> Run: `node analyzer.mjs --mode prospects --icp health-system-cio --top 10`

User: "show me enterprise SaaS buyer prospects"
-> Run: `node analyzer.mjs --mode prospects --icp saas-enterprise-buyer --top 15`

User: "find wealth management prospects"
-> Run: `node analyzer.mjs --mode prospects --icp hnw-prospect --top 10`

User: "who are good CMO/VP Marketing prospects?"
-> Run: `node analyzer.mjs --mode prospects --icp cmo-vp-marketing --top 10`

User: "find me prospects" (no specific ICP)
-> Run: `node analyzer.mjs --mode prospects --top 15`

### Behavioral & Visibility

User: "who are the most active networkers?"
-> Run: `node analyzer.mjs --mode behavioral --top 20`

User: "show me super-connectors"
-> Run: `node analyzer.mjs --mode behavioral --persona super-connector --top 15`

User: "content visibility strategy"
-> Run: `node analyzer.mjs --mode visibility`

User: "which companies have the best network value?"
-> Run: `node analyzer.mjs --mode employers --top 10`

### Referral Partners

User: "who are my best referral partners?"
-> Run: `node analyzer.mjs --mode referrals --top 20`

User: "show me white-label partners"
-> Run: `node analyzer.mjs --mode referrals --persona white-label-partner`

User: "who can bring me work?"
-> Run: `node analyzer.mjs --mode referrals --top 10`

User: "find warm introducers"
-> Run: `node analyzer.mjs --mode referrals --persona warm-introducer --top 15`

User: "score referral partners"
-> Run: `node pipeline.mjs --referrals`

### Network Expansion

User: "expand my network through referral partners"
-> Run: `node batch-deep-scan.mjs --criteria referral --dry-run` (preview first)

User: "deep scan the top hubs"
-> Run: `node batch-deep-scan.mjs --criteria hub --dry-run`

User: "find more contacts across all criteria"
-> Run: `node batch-deep-scan.mjs --criteria all --dry-run`

### Data & Config

User: "export my contacts"
-> Run: `node db.mjs export --format csv`

User: "generate a report"
-> Run: `node pipeline.mjs --report`

User: "configure my ICP"
-> Start conversational config flow (ask about services, roles, industries, signals, niches) -> run `configure.mjs generate --json '...'` -> validate

User: "what's cached?"
-> Run: `node reparse.mjs --stats`

User: "reparse everything from cache"
-> Run: `node reparse.mjs --all`

### Semantic Search

User: "find contacts similar to Jane Doe"
-> Run: `node analyzer.mjs --mode similar --url <jane-doe-profile-url> --top 20`

User: "who talks about AI transformation?"
-> Run: `node analyzer.mjs --mode semantic --query "AI transformation" --top 20`

User: "search for people in cloud infrastructure"
-> Run: `node analyzer.mjs --mode semantic --query "cloud infrastructure engineering" --top 15`

User: "build the vector store"
-> Run: `node scripts/vectorize.mjs --from-graph`

User: "vectorize my contacts"
-> Run: `node scripts/vectorize.mjs --from-graph`

User: "start the dashboard"
-> Start the dashboard app (see Dashboard section)

User: "stop the dashboard"
-> Stop the running dashboard process

## Dashboard App

The Network Intelligence Dashboard is a local Next.js app at `.claude/linkedin-prospector/app/` that provides a visual interface over the network data.

**App directory**: `.claude/linkedin-prospector/app/`
**Data source**: `.linkedin-prospector/data/` (graph.json, network.rvf, outreach-state.json, rate-budget.json)

### Starting the Dashboard

Use the Bash tool with `run_in_background: true` to start the dev server:

```bash
cd .claude/linkedin-prospector/app && npm run dev -- --port 3100
```

IMPORTANT:
- Always use `run_in_background: true` so Claude Code can continue working
- Use port 3100 (avoids conflicts with other dev servers)
- Save the background task ID — you'll need it to check output or stop the server

After starting, verify the server is ready:

```bash
sleep 3 && curl -sf http://localhost:3100/api/dashboard | head -c 200
```

If the server started successfully, tell the user:
> "Dashboard is running at **http://localhost:3100**. You can open it in your browser."

### Checking Dashboard Status

To check if the dashboard is running:

```bash
curl -sf http://localhost:3100/api/dashboard > /dev/null 2>&1 && echo "Dashboard is running on port 3100" || echo "Dashboard is not running"
```

### Stopping the Dashboard

Kill the Next.js dev server:

```bash
pkill -f "next dev.*3100" 2>/dev/null || pkill -f "next-server" 2>/dev/null; echo "Dashboard stopped"
```

Or use fuser if available:

```bash
fuser -k 3100/tcp 2>/dev/null && echo "Dashboard stopped" || echo "Dashboard was not running"
```

### Using the Dashboard API from Claude Code

The dashboard exposes REST APIs that can be called from within Claude Code to query data or trigger actions without running scripts directly. This is useful for building workflows that combine analysis with action.

#### Data Queries

| API | Use Case | Example |
|-----|----------|---------|
| `GET /api/dashboard` | KPIs, top gold contacts, suggested actions | `curl -s http://localhost:3100/api/dashboard` |
| `GET /api/contacts?tier=gold&sort=goldScore&order=desc&pageSize=10` | Query contacts with filters | Gold contacts sorted by score |
| `GET /api/contacts/[slug]` | Full contact detail + edges | `curl -s http://localhost:3100/api/contacts/johndoe` |
| `GET /api/contacts/[slug]/similar` | 5 most similar contacts | Find lookalikes |
| `GET /api/search?q=keyword&limit=20` | Search contacts | `curl -s "http://localhost:3100/api/search?q=CEO"` |
| `GET /api/graph` | Network graph data (200 nodes, pruned edges) | For visualization or analysis |
| `GET /api/niches` | All 10 clusters with stats | Niche/ICP breakdown |
| `GET /api/pipeline` | Outreach funnel + state counts | Pipeline status |
| `GET /api/budget` | Rate budget usage | Check daily limits |

#### Triggering Actions

The dashboard can run prospector scripts via its process manager, which handles Playwright queueing (max 1 concurrent) and SSE output streaming:

```bash
# Start a script
curl -s -X POST http://localhost:3100/api/actions/run \
  -H "Content-Type: application/json" \
  -d '{"scriptId": "rescore"}'

# Start a deep scan
curl -s -X POST http://localhost:3100/api/actions/run \
  -H "Content-Type: application/json" \
  -d '{"scriptId": "deep-scan", "params": {"url": "https://www.linkedin.com/in/johndoe"}}'

# Check what's running
curl -s http://localhost:3100/api/actions/active

# Cancel a running process
curl -s -X POST http://localhost:3100/api/actions/cancel \
  -H "Content-Type: application/json" \
  -d '{"processId": "xxx"}'
```

Available script IDs: `rescore`, `scorer`, `behavioral`, `referral`, `deep-scan`, `batch-deep-scan`, `enrich`, `enrich-graph`, `search`, `activity-scanner`, `report`, `niche-report`, `targeted-plan`, `forget`

#### Updating Config

```bash
# Read current ICP config
curl -s http://localhost:3100/api/config/icp-config.json

# Update ICP config (creates backup first)
curl -s -X PUT http://localhost:3100/api/config/icp-config.json \
  -H "Content-Type: application/json" \
  -d @new-config.json
```

### Workflow Examples

**1. Start dashboard, check status, then run analysis:**
```
/network-intel start dashboard
/network-intel give me an overview
```

**2. Query dashboard API for gold contacts, then deep-dive top one:**
```
curl -s http://localhost:3100/api/contacts?tier=gold&sort=goldScore&order=desc&pageSize=1
# → Take the top slug
curl -s -X POST http://localhost:3100/api/actions/run -H "Content-Type: application/json" -d '{"scriptId":"deep-scan","params":{"url":"..."}}'
```

**3. Monitor pipeline from within Claude Code:**
```
curl -s http://localhost:3100/api/pipeline | python3 -m json.tool
curl -s http://localhost:3100/api/budget | python3 -m json.tool
```
