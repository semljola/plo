# Decisions log

## 2026-10-05 — Greenfield, not Accounted fork

Accounted is AGPL and accounting-coupled. PLO reimplements the *patterns* only
(single write path, staged ops, immutable committed state, RLS tenancy, event
bus, MCP) with clean-room IP. No accounting domain, no Skatteverket/BankID/VAT,
no gnubok identifiers, no AGPL code.

## 2026-10-05 — Dual DB identities for real RLS

The app uses two Postgres roles: the owner role (`DATABASE_URL`) which bypasses
RLS (migrations, seeding, trusted engine commits — the Supabase `service_role`
equivalent), and `plo_app`, a non-owner login (`APP_DATABASE_URL`) for which RLS
is enforced (the `authenticated` equivalent). Request context is a
transaction-scoped `plo.user_id` (`current_setting`), swappable for `auth.uid()`
on Supabase. This is what makes the RLS tests meaningful rather than mocked.

## 2026-10-05 — Single write path = one engine function

Every loop mutation routes through `commitOp` in `src/lib/loop/engine.ts`.
Direct human actions and approved agent operations take the exact same path, so
validation, audit, immutability, and event emission live in one place.
`loop-verify` statically enforces that no loop-table write exists outside the
engine.

## 2026-10-05 — Immutability hardened at two layers

The baseline trigger blocks UPDATE on rows with `approved_at` set. Hardened so
that the approving statement itself cannot also change `body` (approve ≠ rewrite).
Corrections are always new `spec_versions` rows. Enforced in Postgres, not app
code, so it holds regardless of caller.

## 2026-10-05 — Risk-tiered auto-approval

`canAutoApprove(tier)` → only `low`. Medium/high-risk staged operations wait for
a human `approve()`, which additionally requires owner/admin role. Agents amplify
definition quality; they do not auto-merge high-risk change.
