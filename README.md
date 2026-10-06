# Product Loop Optimization (PLO)

**An agentic SDLC that closes the product loop.** One system of record, shared
by humans and agents, for the whole arc:

**idea → spec → build → measure → learn → decide**

Agents propose, humans approve by risk tier, committed state is immutable, and
every write goes through one engine. The near-term engine is an **agentic
software-development lifecycle** (idea → spec → build, with agent-drafted
proposals, human approval, executable specs tied to git SHAs, and a CI gate).
The thesis it is built to grow into is **product-loop optimization**: closing
measure → learn → decide back onto prioritized ideas with evidence.

### What is real today vs the thesis

- **Real and tested now:** the governed human+agent state machine: single write
  path, staged operations with risk-tiered human approval, immutable approved
  specs (DB-trigger enforced), RLS tenancy, event-bus extensions, an MCP surface,
  and a `loop-verify` CI gate. Dashboard controls for filing ideas, drafting
  specs, approving/rejecting agent operations, and recording metrics/snapshots.
- **Scaffolded, not yet closed:** the measure → learn → decide feedback arc. The
  data model (metrics, experiments, learnings, decisions, experiment↔snapshot
  evidence) exists, but learnings do not yet feed back into prioritized ideas.
  Closing that loop is the roadmap, not a current claim. See
  [`docs/prd-agent-build-execution.md`](./docs/prd-agent-build-execution.md).

This project uses the same patterns that [Accounted](https://github.com/erp-mafia/accounted)
uses for their single write path, staged agent ops, immutable committed state,
RLS tenancy, event-bus extensions, MCP surface etc.

PLO is a **clean-room reimplementation of those architectural patterns**. It is
**not a fork** and contains **no code copied from Accounted**. Accounted is
licensed AGPL-3.0; PLO shares the design ideas only, with independently written
code. See [`DECISIONS.md`](./DECISIONS.md).

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
