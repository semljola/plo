-- PLO migration 002 — RLS policies, app role, request context, approval plumbing.
--
-- Security model (maps 1:1 onto Supabase):
--   * The MIGRATION/OWNER role (DATABASE_URL, here "plo") OWNS the tables and
--     therefore BYPASSES RLS — this is the "service_role" equivalent used for
--     migrations, seeding, trusted server tasks and the loop engine's
--     privileged commits.
--   * The APP role ("plo_app", APP_DATABASE_URL) is a NON-owner, NON-superuser
--     login. RLS is ENFORCED for it. Every request sets `plo.user_id` and every
--     policy checks workspace membership — the "authenticated" equivalent.
--
-- Request context: `current_setting('plo.user_id', true)` is the acting user.
-- On Supabase you would swap plo_current_user() for auth.uid(); nothing else
-- changes.

-- ---------------------------------------------------------------------------
-- 1. Application role (idempotent)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'plo_app') then
    create role plo_app login password 'plo_app';
  end if;
end$$;

grant usage on schema public to plo_app;
grant select, insert, update, delete on all tables in schema public to plo_app;
grant usage, select on all sequences in schema public to plo_app;
alter default privileges in schema public
  grant select, insert, update, delete on tables to plo_app;

-- ---------------------------------------------------------------------------
-- 2. Request-context helpers
-- ---------------------------------------------------------------------------
create or replace function plo_current_user()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('plo.user_id', true), '')::uuid
$$;

-- security definer so the membership lookup itself isn't gated by RLS
create or replace function plo_is_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from workspace_members m
    where m.workspace_id = ws
      and m.user_id = plo_current_user()
  )
$$;

create or replace function plo_has_role(ws uuid, roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from workspace_members m
    where m.workspace_id = ws
      and m.user_id = plo_current_user()
      and m.role = any(roles)
  )
$$;

-- ---------------------------------------------------------------------------
-- 3. RLS policies — every tenant table: visible/writable iff caller is a member
-- ---------------------------------------------------------------------------

-- workspaces: a user sees workspaces they belong to
create policy ws_member_select on workspaces
  for select using (plo_is_member(id));

-- workspace_members: a user sees membership rows of their own workspaces
create policy wm_member_select on workspace_members
  for select using (plo_is_member(workspace_id));
create policy wm_admin_write on workspace_members
  for all using (plo_has_role(workspace_id, array['owner','admin']))
  with check (plo_has_role(workspace_id, array['owner','admin']));

-- generic membership policies for the loop tables
do $$
declare t text;
begin
  foreach t in array array[
    'teams','ideas','specs','spec_versions','builds','releases',
    'metric_definitions','metric_snapshots','experiments','learnings',
    'decisions','pending_operations','event_log','audit_log','api_keys'
  ]
  loop
    execute format(
      'create policy %I on %I for all using (plo_is_member(workspace_id)) with check (plo_is_member(workspace_id));',
      t || '_member_all', t
    );
  end loop;
end$$;

-- ---------------------------------------------------------------------------
-- 3b. Experiment ↔ metric snapshot provenance links
-- ---------------------------------------------------------------------------
create table if not exists experiment_metric_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  experiment_id uuid not null references experiments(id) on delete cascade,
  snapshot_id uuid not null references metric_snapshots(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (experiment_id, snapshot_id)
);
alter table experiment_metric_links enable row level security;
grant select, insert, update, delete on experiment_metric_links to plo_app;
create policy experiment_metric_links_member_all on experiment_metric_links
  for all using (plo_is_member(workspace_id)) with check (plo_is_member(workspace_id));

-- ---------------------------------------------------------------------------
-- 4. Approval plumbing on pending_operations
-- ---------------------------------------------------------------------------
alter table pending_operations
  add column if not exists proposed_by uuid,
  add column if not exists decided_by uuid,
  add column if not exists decided_at timestamptz,
  add column if not exists result jsonb,
  add column if not exists error text;

-- ---------------------------------------------------------------------------
-- 5. spec_versions: enforce single approval path + immutable body
-- ---------------------------------------------------------------------------
-- Baseline already blocks UPDATE on rows whose approved_at is set. Harden:
-- block UPDATE of the body column even in the transition that stamps
-- approved_at, so "approve" can never also silently rewrite the body.
create or replace function prevent_approved_spec_version_update()
returns trigger
language plpgsql
as $$
begin
  if old.approved_at is not null then
    raise exception 'approved spec_versions rows are immutable; create a new version';
  end if;
  -- approving a draft: allow stamping approved_at but forbid body edits in the
  -- same statement (correction must be a brand-new version row).
  if new.approved_at is not null and new.body is distinct from old.body then
    raise exception 'cannot modify spec body while approving; create a new version';
  end if;
  return new;
end;
$$;
-- trigger already attached in baseline; function replaced in place.
