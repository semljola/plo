# loop-feedback-triage

**When:** raw feedback (support tickets, Slack, interviews, NPS verbatims) needs
to be turned into loop artifacts.

**Rules:**

- Triage feedback into **ideas** (opportunities / hypotheses), not specs. An
  idea is cheap and unblocked; a spec is executable intent that will gate work.
- Stage ideas as **low-risk** operations — they auto-commit:
  ```
  POST /api/pending-operations
  { "kind": "idea.create", "risk_tier": "low",
    "payload": { "title": "...", "body": "..." } }
  ```
- Group duplicate feedback under one idea; put supporting quotes/links in the
  `body`. Do not create a new idea per ticket.
- When an idea is promoted to a spec, link it (`idea_id` on `spec.draft`) so the
  loop stays connected idea → spec → build → metric → learning → decision.
- Record what you learn from feedback as **learnings** tied to the experiment
  or spec that it bears on — never as a free-floating note (`AGENTS.md` rule #4).

**Pitfall:** don't let triage silently approve specs. Ideas are safe to
auto-commit; anything that changes product intent (a spec draft/approval) is
medium/high risk and waits for a human.
