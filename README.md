# Product Loop Optimization (PLO)

One system of record for the product loop, shared by humans and agents:

**idea → spec → build → measure → learn → decide**

Not a fork of [Accounted](https://github.com/erp-mafia/accounted). Same *patterns*
(single write path, staged agent ops, immutable committed state, RLS tenancy,
event-bus extensions, MCP surface), clean-room IP.

## Stack

TypeScript · Next.js App Router · Postgres + RLS (Supabase-compatible, EU
`eu-north-1` / `arn1`) · Zod · Vitest · MCP.

## Core ideas

- **Single write path** — every mutation to the loop graph goes through
  `commitOp` in `src/lib/loop/engine.ts`. One place for validation, audit,
  events, and invariants.
- **Staged agent operations** — agents propose into `pending_operations` with a
  risk tier. Low-risk auto-commits; **medium/high wait for a human**. Agents
  never auto-merge high-risk changes.
- **Immutable approved specs** — approving a spec version stamps `approved_at`;
  a Postgres trigger then blocks any in-place edit. A correction is a **new
  version**, never a rewrite.
- **Tenancy by RLS** — every row carries `workspace_id`; isolation is enforced
  by Postgres, not app code. The app connects as a non-owner role (`plo_app`)
  so RLS actually applies (owner role = the Supabase `service_role` equivalent).
- **Event-bus extensions** — core never imports extensions; extensions subscribe
  to committed events (`src/extensions/general/*`), wired once in
  `src/extensions/register.ts`.

## Quickstart (local)

```bash
# 1. Postgres (any instance). For a throwaway one:
docker run -d --name plo-test-db -e POSTGRES_USER=plo -e POSTGRES_DB=plo \
  -e POSTGRES_HOST_AUTH_METHOD=trust -p 55432:5432 postgres:16-alpine

# 2. install + migrate
npm install
node scripts/db-reset.mjs --fresh

# 3. verify everything (structural gate + typecheck + DB tests)
RUN_DB_TESTS=1 npm run loop-verify

# 4. seed a demo workspace and run the app
node scripts/seed-demo.mjs   # prints PLO_DEMO_USER / PLO_DEMO_WORKSPACE
npm run build && npm run start
# → http://localhost:3000  and  /dashboard
```

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/db-reset.mjs [--fresh]` | Apply migrations (optionally drop first) |
| `scripts/seed-demo.mjs` | Seed a demo workspace with a full loop |
| `scripts/make-key.mjs <ws> [admin\|member]` | Mint a workspace-scoped API key |
| `scripts/e2e-http.mjs` | Live HTTP end-to-end test against a running server |
| `scripts/checks/loop-verify.mjs` (`npm run loop-verify`) | The agent-PR gate |

## Agent surface

- **HTTP API** — `/api/pending-operations` (propose / approve / reject),
  `/api/ideas`, `/api/specs`, `/api/metrics`. Auth via `Authorization: Bearer
  <api_key>` (workspace-scoped) or, in dev, `PLO_DEV_AUTH=1` + `x-plo-user` /
  `x-plo-workspace` headers.
- **MCP** — `packages/plo-mcp` exposes the loop as MCP tools
  (`plo_propose_operation`, `plo_approve_operation`, `plo_list_pending`,
  `plo_list_specs`, `plo_list_metrics`). Credential-bound to one workspace key.

## Tests

16 DB-backed integration tests (`tests/pg/*.test.ts`) run against real Postgres
and prove the four success criteria:

1. A human can approve a staged agent-drafted spec.
2. An approved spec body cannot be mutated in place.
3. A metric snapshot can be recorded and linked to an experiment/learning.
4. CI runs `loop-verify` before agent PRs.

```bash
RUN_DB_TESTS=1 npm test
```

See `docs/architecture.md`, `CLAUDE.md`, `AGENTS.md`, and `.claude/skills/loop-*`.
