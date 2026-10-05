<!--
PLO pull request. Keep the loop honest: agents propose, humans approve,
approved specs are immutable, every write goes through the engine.
-->

## What & why

<!-- One or two sentences. Link the idea / spec / experiment this serves. -->

- Idea / spec: <!-- id or link -->
- Loop stage: <!-- idea | spec | build | metric | experiment | learning | decision -->

## Changes

<!-- Bullet the concrete changes. -->

-

## Loop invariants checklist

- [ ] All loop-table writes go through `commitOp` (`src/lib/loop/engine.ts`) — no ad-hoc INSERT/UPDATE.
- [ ] Core does not import `src/extensions/*` (extensions → core only).
- [ ] No approved spec body edited in place; corrections are new versions.
- [ ] No invented metrics; snapshots reference an existing `metric_definition`.
- [ ] New tenant tables have `workspace_id` + an RLS membership policy.
- [ ] High-risk agent actions stage into `pending_operations` (no auto-merge).

## Verification

- [ ] `RUN_DB_TESTS=1 npm run loop-verify` passes locally.
- [ ] New behaviour has a DB-backed test in `tests/pg/`.

<!-- Agent-authored PR? Confirm loop-verify ran and paste the summary line. -->
