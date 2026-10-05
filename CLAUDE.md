# PLO — agent notes

- Single write path: `src/lib/loop/engine.ts` (draft → approve → commit).
- Agents never auto-commit high-risk ops; use `pending_operations`.
- Approved specs are immutable; corrections = new `spec_versions` row.
- Core must not import `src/extensions/*`.
- Prefer executable specs (tests, schemas) over prose alone.
