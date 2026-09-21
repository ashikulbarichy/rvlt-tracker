-- 004 step 3: ticket types, workspace-level.
--
-- Workspace-level rather than per-team, deliberately: 003 collapsed per-team workflow
-- states precisely because duplicating a lookup table per team let a ticket point at
-- another team's row. Types would have the same failure mode.
--
-- Run 20260922091000_rename_issues_to_tickets.sql first.

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------
create table if not exists public.ticket_types (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  color text not null default '#6B7280',
  position integer not null default 0,
  -- Whether a ticket of this type moves the project progress bar. Per-type rather than
  -- a hardcoded "is it Feature" check, because users can add their own types.
  counts_toward_progress boolean not null default false,
  -- The type new tickets get.
  is_default boolean not null default false,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Same shape as the status uniqueness index 003 added, for the same reason: "Bug" and
-- " bug " are the same type.
create unique index if not exists ticket_types_workspace_name_key
  on public.ticket_types (workspace_id, lower(btrim(name)));

-- At most one default per workspace.
create unique index if not exists ticket_types_workspace_default_key
  on public.ticket_types (workspace_id) where is_default;

-- ---------------------------------------------------------------------------
-- 2. RLS: workspace members read, admins write. Mirrors workflow_states after 003.
-- ---------------------------------------------------------------------------
alter table public.ticket_types enable row level security;

drop policy if exists "Members can view ticket types" on public.ticket_types;
create policy "Members can view ticket types"
  on public.ticket_types for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists "Admins can manage ticket types" on public.ticket_types;
create policy "Admins can manage ticket types"
  on public.ticket_types for all
  to authenticated
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

-- ---------------------------------------------------------------------------
-- 3. Seeding
-- ---------------------------------------------------------------------------
create or replace function public.seed_default_ticket_types(p_workspace_id uuid)
returns void as $$
begin
  insert into public.ticket_types (workspace_id, name, color, position, counts_toward_progress, is_default)
  values
    (p_workspace_id, 'Bug',         '#B55151', 0, false, false),
    (p_workspace_id, 'Feature',     '#1ED760', 1, true,  true),
    (p_workspace_id, 'Improvement', '#4A7BB5', 2, false, false)
  on conflict do nothing;
end;
$$ language plpgsql security definer;

-- Recreate the workspace trigger function so new workspaces get types as well as
-- statuses. Body copied from 003 step 10 with the one extra call.
create or replace function public.handle_new_workspace()
returns trigger as $$
begin
  if new.created_by is not null then
    insert into public.workspace_members (workspace_id, user_id, role)
    values (new.id, new.created_by, 'admin')
    on conflict do nothing;
  end if;
  perform public.seed_default_workspace_workflow_states(new.id);
  perform public.seed_default_ticket_types(new.id);
  return new;
end;
$$ language plpgsql security definer;

-- Every existing workspace with no types gets the defaults.
do $$
declare w record;
begin
  for w in select id from public.workspaces loop
    if not exists (select 1 from public.ticket_types where workspace_id = w.id) then
      perform public.seed_default_ticket_types(w.id);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. tickets.type_id
--
-- Added nullable, backfilled, then set not null. Adding it NOT NULL up front fails
-- outright on a non-empty table.
--
-- on delete restrict matches state_id: deleting a type still in use must fail loudly
-- rather than quietly nulling tickets. Silently repointing rows is exactly what
-- produced the bug 003 had to repair.
-- ---------------------------------------------------------------------------
alter table public.tickets
  add column if not exists type_id uuid references public.ticket_types(id) on delete restrict;

-- Every existing ticket becomes a Feature, which preserves today's progress numbers:
-- progress currently counts every ticket, and Feature is the type that counts.
update public.tickets t
   set type_id = tt.id
  from public.ticket_types tt
 where tt.workspace_id = t.workspace_id
   and lower(btrim(tt.name)) = 'feature'
   and t.type_id is null;

-- Anything still null (a workspace whose Feature row was renamed before this ran) falls
-- back to that workspace's default type, then to its lowest-position type.
update public.tickets t
   set type_id = tt.id
  from public.ticket_types tt
 where tt.workspace_id = t.workspace_id
   and tt.is_default
   and t.type_id is null;

update public.tickets t
   set type_id = pick.id
  from (
    select distinct on (workspace_id) workspace_id, id
      from public.ticket_types
     order by workspace_id, position, created_at
  ) pick
 where pick.workspace_id = t.workspace_id
   and t.type_id is null;

alter table public.tickets alter column type_id set not null;

create index if not exists idx_tickets_type on public.tickets(type_id);

notify pgrst, 'reload schema';

-- Confirm: every workspace has its three types, and no ticket is untyped.
select tt.name, tt.counts_toward_progress, tt.is_default, count(t.id) as tickets
  from public.ticket_types tt
  left join public.tickets t on t.type_id = tt.id
 group by tt.name, tt.counts_toward_progress, tt.is_default
 order by tt.name;
