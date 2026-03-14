# Phase: Directory Restructure + MCP Architecture

**Date**: 2026-03-14
**Author**: claude-flow

---

## Directory Restructure

| Before | After | Notes |
|--------|-------|-------|
| `src/` | `app/src/` | Next.js app, all Node.js code |
| `Dockerfile`, `.dockerignore` | `app/Dockerfile`, `app/.dockerignore` | Build context scoped to app |
| Browser extension (root) | `browser/` | Chrome MV3 extension |
| Agents (scattered) | `agent/linkedin-prospector/` (v1), `agent/network-intelligence/` (v2) | Agent namespace |
| Data (mixed) | `data/drives/[db,shared,config]` (Docker mounts), `data/linkedin/` (exports) | All gitignored |
| Plans | `docs/.sparc/v2/` | Was `.claude/linkedin-prospector/docs/plans/v2/` |
| Tests (scattered) | `tests/` | Root level, jest configured with `<rootDir>/../tests` |

## Docker Compose Changes

- App build context: `.` → `./app`
- DB volume: named `pgdata` → bind mount `./data/drives/db`
- Shared volume: `./data/drives/shared:/app/data/shared`
- Removed empty `app_node_modules` named volume
- Healthcheck: `localhost` → `127.0.0.1` (IPv6 fix in Alpine)

## Architecture: MCP with ruvector Rust

- Intelligence layer migrating from Next.js API routes to MCP tools
- MCP server follows `mcp-gate` crate pattern (Rust, stdio, JSON-RPC 2.0)
- ruvector-postgres provides 230+ SQL functions already in DB
- Key capabilities: FastGRNN routing, self-learning trajectories, graph analytics, vector search
- Agent routing via `ruvector_route_query()` and `ruvector_adaptive_route()`

## Agent Namespace

- `agent/linkedin-prospector/` — V1 agent preserved as-is
- `agent/network-intelligence/` — V2 MCP-native agent

## Build Fixes

- `next.config.ts`: `import.meta.url` replaces `__dirname` for ESM compatibility
- `jest.config.ts`: roots updated to `<rootDir>/../tests`
- `.env` symlink: `app/.env → ../.env`

## Security

- Comprehensive `.gitignore` hardening (12+ new exclusion patterns)
- No PII, credentials, or session data in repository
