# PLO — Cursor brief

Build a **Product Loop Optimization** tool: idea → spec → build → measure → learn → decide.

## Relation to Accounted

- **Reference only:** [erp-mafia/accounted](https://github.com/erp-mafia/accounted) (Swedish OSS accounting, agent-native).
- **Do not fork.** Accounted is AGPL-3.0 and accounting-coupled (~199k TS, 1k+ migrations). Patterns yes; code copy no.
- **This repo** (`~/Code/futurice/plo/`) is a **greenfield** skeleton with the same *architecture ideas*, clean IP.

### Steal as patterns (reimplement)

| Pattern | Accounted | PLO |
|---------|-----------|-----|
| Single write path | `bookkeeping/engine.ts` | `src/lib/loop/engine.ts` |
| Staged agent ops | `pending_operations` + risk tiers | same table/concept |
| Immutable committed state | posted journal entries | approved `spec_versions` (trigger blocks UPDATE) |
| Event bus + extensions | core never imports plugins | `src/extensions/general/*` |
| Agent surface | MCP + OAuth + API keys | `packages/plo-mcp`, `mcp-oauth` |
| Tenancy | `company_id` + RLS | `workspace_id` + RLS |
| Agent loops | `.claude/loops.md` | `loop-verify`, `loop-metric-pull`, `loop-feedback-triage`, `loop-spec-draft` |

### Do not bring over

Accounting domain, Skatteverket/BankID/VAT, gnubok identifiers, `connect.accounted.se`, Swedish compliance packs, AGPL code.

## Product goal

Codify the product loop so humans and agents share one system of record:

1. **Ideas** — opportunities / hypotheses  
2. **Specs** — executable intent; **immutable when approved** (new version = correction)  
3. **Builds / releases** — link to git SHA / env  
4. **Metrics** — definitions + snapshots  
5. **Experiments** — linked to specs + metrics  
6. **Learnings / decisions** — outcomes tied to evidence  
7. **Pending operations** — agents propose; humans approve by risk tier  

Agents amplify **definition quality** and automation inside the loop; they do not auto-merge high-risk changes.

## Stack (intended)

TypeScript · Next.js App Router · Supabase Postgres + RLS · Zod · Vitest · MCP · EU region (`arn1` / eu-north-1).

## What’s already in the skeleton

- Folder map under `src/`, `packages/`, `.claude/skills/loop-*`
- `CLAUDE.md`, `AGENTS.md`, `DECISIONS.md`, `docs/architecture.md`
- Baseline migration: `supabase/migrations/20261005120000_plo_baseline.sql`
- Stubs only — no `npm install` / no running app yet

## Build order (for Cursor)

1. Workspace auth + RLS policies  
2. Implement `loop/engine` + `pending_operations` approve/reject  
3. Ideas → specs → `spec_versions` + immutability (already in SQL)  
4. Metrics ingest + minimal dashboard  
5. MCP server + `loop-verify` gate  
6. Extensions: GitHub, Linear/Jira, PostHog, Vercel/Sentry, Slack  

## Non-goals (v0)

- Full monorepo (Turbo/Nx) — single Next app at repo root, like Accounted’s shape  
- Auto-merge / unsupervised production deploys  
- Accounting, ERP, or ABB field-report features (separate threads)

## Success criteria

- Human can approve a staged agent-drafted spec  
- Approved spec body cannot be mutated in place  
- Metric snapshot can be recorded and linked to an experiment/learning  
- CI can run `loop-verify` before agent PRs  
