# loop-verify

**When:** before opening any automated/agent-authored PR, and in CI on every PR.

**What it enforces** (via `scripts/checks/loop-verify.mjs`, `npm run loop-verify`):

1. **Core isolation** — nothing under `src/lib` or `src/app` imports `src/extensions/*`. The dependency only goes extensions → core.
2. **Single write path** — the staged loop tables (`ideas`, `specs`, `spec_versions`, `builds`, `metric_definitions`, `metric_snapshots`, `experiments`, `learnings`, `decisions`) are only INSERTed/UPDATEd inside `src/lib/loop/engine.ts`. Everything else calls `commitOp`.
3. **Immutability trigger present** — a migration defines `trg_spec_versions_immutable` / `prevent_approved_spec_version_update`.
4. **Typecheck** — `tsc --noEmit` is clean.
5. **Tests** — with `RUN_DB_TESTS=1` and a database, `vitest run` passes.

**Run:**

```bash
npm run loop-verify              # structural checks + typecheck
RUN_DB_TESTS=1 npm run loop-verify   # also runs the DB-backed test suite
```

Exit non-zero blocks the merge. This is the machine-checkable half of `AGENTS.md`.

**Pitfall:** read-only `SELECT`s against loop tables are fine anywhere; only writes must route through the engine. If you add a new append-only link table (like `releases`), add it to the allowlist in the check, not the loop-table list.
