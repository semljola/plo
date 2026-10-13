-- PLO migration 003 — build_jobs transactional outbox.
--
-- When a buildable spec version is approved, the engine inserts a build_jobs
-- row IN THE SAME TRANSACTION as the approval (transactional outbox). The row
-- commits atomically with the approval, so a build job exists if and only if
-- the approval actually stuck — no acting on uncommitted/rolled-back state.
--
-- A worker later claims queued jobs with FOR UPDATE SKIP LOCKED, runs the agent
-- runner, and stages a build.record pending operation for a human to approve.
-- See docs/prd-agent-build-execution.md.

create table build_jobs (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  spec_id       uuid not null references specs(id) on delete cascade,
  spec_version  int  not null,
  status        text not null default 'queued',   -- queued | running | succeeded | failed
  git_sha       text,
  attempts      int  not null default 0,
  error         text,
  claimed_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz not null default now(),
  -- Idempotency: at most one build per approved (spec, version). A double-click
  -- or retry on approve cannot create a second job.
  unique (spec_id, spec_version)
);

-- Status filtering for the worker's claim query.
create index build_jobs_status_idx on build_jobs (status, created_at);

alter table build_jobs enable row level security;
grant select, insert, update, delete on build_jobs to plo_app;

-- Standard membership policy — same tenancy boundary as every other table.
create policy build_jobs_member_all on build_jobs
  for all using (plo_is_member(workspace_id)) with check (plo_is_member(workspace_id));
