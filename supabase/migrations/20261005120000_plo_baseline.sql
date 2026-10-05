-- PLO baseline schema (greenfield). Enable RLS; policies TBD per workspace membership.

create extension if not exists "pgcrypto";

-- Tenancy
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- Loop artifacts
create table ideas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null,
  body text,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create table specs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  idea_id uuid references ideas(id) on delete set null,
  title text not null,
  status text not null default 'draft', -- draft | approved
  created_at timestamptz not null default now()
);

create table spec_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  spec_id uuid not null references specs(id) on delete cascade,
  version int not null,
  body jsonb not null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (spec_id, version)
);

-- Immutable approved spec bodies: block UPDATE when approved_at is set
create or replace function prevent_approved_spec_version_update()
returns trigger
language plpgsql
as $$
begin
  if old.approved_at is not null then
    raise exception 'approved spec_versions rows are immutable; create a new version';
  end if;
  return new;
end;
$$;

create trigger trg_spec_versions_immutable
  before update on spec_versions
  for each row
  execute function prevent_approved_spec_version_update();

create table builds (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  spec_id uuid references specs(id) on delete set null,
  git_sha text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table releases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  build_id uuid references builds(id) on delete set null,
  environment text not null,
  released_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table metric_definitions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  key text not null,
  description text,
  unit text,
  created_at timestamptz not null default now(),
  unique (workspace_id, key)
);

create table metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  metric_id uuid not null references metric_definitions(id) on delete cascade,
  value double precision not null,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table experiments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  spec_id uuid references specs(id) on delete set null,
  name text not null,
  status text not null default 'planned',
  created_at timestamptz not null default now()
);

create table learnings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  experiment_id uuid references experiments(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create table decisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  learning_id uuid references learnings(id) on delete set null,
  body text not null,
  committed_at timestamptz,
  created_at timestamptz not null default now()
);

create table pending_operations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  kind text not null,
  risk_tier text not null default 'low', -- low | medium | high
  payload jsonb not null default '{}',
  status text not null default 'pending', -- pending | approved | rejected
  created_at timestamptz not null default now()
);

create table event_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  actor_id uuid,
  action text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  key_hash text not null,
  scopes text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- RLS stubs (policies TBD)
alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table teams enable row level security;
alter table ideas enable row level security;
alter table specs enable row level security;
alter table spec_versions enable row level security;
alter table builds enable row level security;
alter table releases enable row level security;
alter table metric_definitions enable row level security;
alter table metric_snapshots enable row level security;
alter table experiments enable row level security;
alter table learnings enable row level security;
alter table decisions enable row level security;
alter table pending_operations enable row level security;
alter table event_log enable row level security;
alter table audit_log enable row level security;
alter table api_keys enable row level security;
