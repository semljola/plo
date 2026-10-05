# Architecture

**Loop:** idea → spec (immutable when approved) → build/release → metrics →
experiment → learning → decision.

## Layers

- **Engine** (`src/lib/loop/engine.ts`) — the single write path. `commitOp(tx,
  ctx, kind, payload)` validates (Zod), writes, audits, and emits an event,
  atomically within the caller's transaction. Every stage transition goes
  through it.
- **Services** (`src/lib/{ideas,specs,metrics,experiments,learnings,decisions,
  builds,releases}`) — thin wrappers that open an RLS-scoped transaction
  (`withUser`) and call the engine. Direct human actions and approved agent ops
  share this path.
- **Staged ops** (`src/lib/pending-operations`) — `propose` / `approve` /
  `reject`. Low-risk proposals auto-commit through the engine; medium/high stay
  pending until a human (owner/admin) approves.
- **DB** (`src/lib/db`) — two pools: owner (bypasses RLS, trusted) and `plo_app`
  (RLS enforced). `withUser(userId, fn)` sets a tx-scoped `plo.user_id`;
  `withAdmin(fn)` runs trusted.
- **Events** (`src/lib/events`) — in-process bus. Core emits committed events;
  extensions subscribe. Handler errors are isolated — one bad extension never
  breaks the loop.
- **Extensions** (`src/extensions/*`) — event-bus consumers (github, linear,
  jira, posthog, vercel, sentry, slack, mcp-server). **Core never imports
  them**; they import core and are wired once in `src/extensions/register.ts`.
- **Agent surface** — HTTP API (`src/app/api/*`) with API-key / dev-header auth,
  and MCP (`packages/plo-mcp`) as a credential-bound client of that API.

## Invariants (enforced, not conventional)

- **Tenancy:** every row has `workspace_id`; RLS policies check workspace
  membership via `plo_is_member`. Cross-workspace read/write is blocked by
  Postgres.
- **Immutability:** approving a spec version stamps `approved_at`; a trigger
  then blocks UPDATE and forbids body edits during approval. Corrections are new
  versions.
- **Single write path:** `loop-verify` statically rejects any loop-table write
  outside the engine.
- **No invented metrics:** a snapshot must reference an existing
  `metric_definition`.

## Migrations

- `…120000_plo_baseline.sql` — tables, RLS enabled, base immutability trigger.
- `…130000_plo_rls_and_approvals.sql` — `plo_app` role, request-context helpers,
  membership policies, experiment↔metric links, approval columns, hardened
  immutability function.
