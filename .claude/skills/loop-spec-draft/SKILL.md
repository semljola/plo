# loop-spec-draft

**When:** an agent is asked to turn an idea into an executable spec.

**Rules:**

- Specs are **executable intent**, not prose. The `body` jsonb should carry
  acceptance criteria, schema references, and test ids — things a build can be
  checked against. Prefer `{ acceptance: [...], tests: [...], schema: {...} }`
  over a paragraph.
- Draft via a **staged operation**, not a direct write:
  ```
  POST /api/pending-operations
  { "kind": "spec.draft", "risk_tier": "medium",
    "payload": { "title": "...", "idea_id": "...", "body": { ... } } }
  ```
- Choose the risk tier honestly. A spec that gates a production behaviour change
  is `high` and must wait for a human `plo_approve_operation`. Only trivial,
  reversible drafts are `low` (auto-commit).
- **Corrections = new versions.** Never try to edit an approved spec body; call
  `spec.version.add` to append a corrected version. The DB trigger will reject
  in-place edits anyway.

**Verify your draft** before proposing: the payload must pass the `SpecDraft`
Zod schema (`src/lib/loop/schemas.ts`). Invalid payloads are rejected at
proposal time, not silently staged.
