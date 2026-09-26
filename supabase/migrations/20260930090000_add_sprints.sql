-- 012: sprints (spec 006, phase 1).
--
-- A sprint belongs to a TEAM. A team runs one sprint at a time, and a sprint holds that
-- team's tickets from any of its projects; the project association is derived from the
-- tickets, never stored. Progress counts all ticket types.
--
-- Status moves only through start_sprint() and complete_sprint(). Completing a sprint
-- snapshots every ticket's outcome into sprint_results before unfinished tickets move
-- on -- without the snapshot, what a sprint contained is lost the moment it completes.
--
-- tickets.sprint_id is a SIMPLE foreign key plus a trigger for "same team", not a
-- composite (team_id, sprint_id) key. tickets is embedded all over the client through
-- the column hint `team:team_id(...)`, and a second foreign key containing team_id risks
-- making that embed ambiguous -- which would break the ticket list the moment this
-- migration ran, before any client change. The trigger holds the same invariant because
-- a sprint's team is immutable and a ticket changing team drops its sprint.
--
-- To undo:
--   drop trigger if exists tickets_sprint_guard on public.tickets;
--   alter table public.tickets drop column if exists sprint_id;
--   drop table if exists public.sprint_results;
--   drop table if exists public.sprints cascade;
--   drop function if exists public.start_sprint(uuid);
--   drop function if exists public.complete_sprint(uuid, uuid);
--   drop function if exists public.can_manage_team_sprints(uuid, uuid);
--   drop function if exists public.sprints_before_write();
--   drop function if exists public.tickets_sprint_guard();
--   alter table public.teams drop column if exists sprint_counter;
--   -- and restore the activity_logs check from 20260923090000.
--
-- REQUIRES 20260927090000 (teams_workspace_id_id_key).

-- ---------------------------------------------------------------------------
-- 1. Numbering: one counter per team, as teams.ticket_counter does for tickets.
-- ---------------------------------------------------------------------------
alter table public.teams add column if not exists sprint_counter integer not null default 0;

-- Created by 20260927090000; restated so this file stands alone if replayed.
create unique index if not exists teams_workspace_id_id_key
  on public.teams (workspace_id, id);

-- ---------------------------------------------------------------------------
-- 2. Who may plan a team's sprints: an admin, or a workspace member on the team.
--    The projects predicate from 20260827135500, named once and reused below.
-- ---------------------------------------------------------------------------
create or replace function public.can_manage_team_sprints(p_workspace_id uuid, p_team_id uuid)
returns boolean as $fn$
  select public.is_workspace_admin(p_workspace_id)
      or (public.is_workspace_member(p_workspace_id) and public.is_team_member(p_team_id));
$fn$ language sql security definer stable;

-- ---------------------------------------------------------------------------
-- 3. sprints
-- ---------------------------------------------------------------------------
create table if not exists public.sprints (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  team_id uuid not null,
  -- Assigned by the trigger; anything the client sends is overwritten.
  number integer not null,
  -- Optional display override. The UI falls back to "Sprint <number>".
  name text,
  goal text,
  start_date date not null,
  end_date date not null,
  status text not null default 'planned'
    check (status in ('planned', 'active', 'completed')),
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint sprints_dates_ordered check (end_date >= start_date),
  constraint sprints_team_number_key unique (team_id, number),

  -- The sprint's team must be a team of the sprint's workspace.
  foreign key (workspace_id, team_id)
    references public.teams (workspace_id, id) on delete cascade
);

-- One active sprint per team. Partial is fine here: nothing upserts against it.
create unique index if not exists sprints_one_active_per_team
  on public.sprints (team_id) where status = 'active';

create index if not exists idx_sprints_workspace on public.sprints (workspace_id);

-- ---------------------------------------------------------------------------
-- 4. sprints: numbering, immutability, the status guard, no overlapping dates
-- ---------------------------------------------------------------------------
create or replace function public.sprints_before_write()
returns trigger as $fn$
declare
  v_number integer;
  v_clash record;
begin
  if tg_op = 'INSERT' then
    -- The counter update also takes the row lock on the team that serialises the
    -- overlap check below, so two sprints created at once cannot both pass it.
    update public.teams
       set sprint_counter = sprint_counter + 1
     where id = new.team_id
    returning sprint_counter into v_number;

    if v_number is null then
      raise exception 'That team does not exist' using errcode = '23503';
    end if;

    new.number := v_number;
    -- A sprint is born planned. Starting it is start_sprint()'s job.
    new.status := 'planned';
    new.started_at := null;
    new.completed_at := null;
    new.created_by := auth.uid();
  else
    if new.team_id is distinct from old.team_id
       or new.workspace_id is distinct from old.workspace_id then
      raise exception 'A sprint cannot move to another team' using errcode = '42501';
    end if;
    new.number := old.number;
    new.created_by := old.created_by;

    -- Completing by editing the column would skip the snapshot and leave unfinished
    -- tickets attached to a closed sprint. Only the two functions set this flag, and
    -- PostgREST exposes no way for a client to set it.
    if new.status is distinct from old.status
       and coalesce(current_setting('app.sprint_transition', true), '') <> 'on' then
      raise exception 'Start or complete a sprint with its buttons, not by editing its status'
        using errcode = '42501';
    end if;

    if old.status = 'completed'
       and (new.start_date is distinct from old.start_date
            or new.end_date is distinct from old.end_date) then
      raise exception 'A completed sprint''s dates cannot change' using errcode = '42501';
    end if;

    perform 1 from public.teams where id = new.team_id for update;
  end if;

  select s.number, s.name into v_clash
    from public.sprints s
   where s.team_id = new.team_id
     and s.id <> new.id
     and daterange(s.start_date, s.end_date, '[]') && daterange(new.start_date, new.end_date, '[]')
   order by s.start_date
   limit 1;

  if found then
    raise exception 'These dates overlap %', coalesce(v_clash.name, 'Sprint ' || v_clash.number)
      using errcode = '23P01';
  end if;

  new.updated_at := now();
  return new;
end;
$fn$ language plpgsql security definer;

drop trigger if exists sprints_before_write on public.sprints;
create trigger sprints_before_write
  before insert or update on public.sprints
  for each row execute function public.sprints_before_write();

-- ---------------------------------------------------------------------------
-- 5. sprints RLS -- mirrors projects
-- ---------------------------------------------------------------------------
alter table public.sprints enable row level security;

drop policy if exists "Team members can view sprints" on public.sprints;
create policy "Team members can view sprints"
  on public.sprints for select
  to authenticated
  using (public.can_manage_team_sprints(workspace_id, team_id));

drop policy if exists "Team members can create sprints" on public.sprints;
create policy "Team members can create sprints"
  on public.sprints for insert
  to authenticated
  with check (public.can_manage_team_sprints(workspace_id, team_id));

drop policy if exists "Team members can update sprints" on public.sprints;
create policy "Team members can update sprints"
  on public.sprints for update
  to authenticated
  using (public.can_manage_team_sprints(workspace_id, team_id))
  with check (public.can_manage_team_sprints(workspace_id, team_id));

-- Active and completed sprints are history; only a planned one can be deleted.
drop policy if exists "Admins can delete planned sprints" on public.sprints;
create policy "Admins can delete planned sprints"
  on public.sprints for delete
  to authenticated
  using (public.is_workspace_admin(workspace_id) and status = 'planned');

-- ---------------------------------------------------------------------------
-- 6. tickets.sprint_id
--
-- on delete set null: deleting a planned sprint returns its tickets to the backlog.
-- ---------------------------------------------------------------------------
alter table public.tickets
  add column if not exists sprint_id uuid references public.sprints(id) on delete set null;

create index if not exists idx_tickets_sprint
  on public.tickets (sprint_id) where sprint_id is not null;

create or replace function public.tickets_sprint_guard()
returns trigger as $fn$
declare
  v_sprint record;
begin
  -- The old sprint belongs to the old team.
  if tg_op = 'UPDATE' and new.team_id is distinct from old.team_id then
    new.sprint_id := null;
  end if;

  if new.sprint_id is null then
    return new;
  end if;

  -- An unchanged sprint is not re-checked, so finished tickets in a completed sprint
  -- can still be edited.
  if tg_op = 'UPDATE' and new.sprint_id is not distinct from old.sprint_id then
    return new;
  end if;

  select team_id, status, number, name into v_sprint
    from public.sprints
   where id = new.sprint_id;

  if not found then
    raise exception 'That sprint does not exist' using errcode = '23503';
  end if;

  if v_sprint.team_id <> new.team_id then
    raise exception 'That sprint belongs to another team' using errcode = '23514';
  end if;

  if v_sprint.status = 'completed' then
    raise exception '% is completed and cannot take new tickets',
      coalesce(v_sprint.name, 'Sprint ' || v_sprint.number)
      using errcode = '23514';
  end if;

  return new;
end;
$fn$ language plpgsql security definer;

drop trigger if exists tickets_sprint_guard on public.tickets;
create trigger tickets_sprint_guard
  before insert or update of team_id, sprint_id on public.tickets
  for each row execute function public.tickets_sprint_guard();

-- ---------------------------------------------------------------------------
-- 7. sprint_results -- written only by complete_sprint()
-- ---------------------------------------------------------------------------
create table if not exists public.sprint_results (
  sprint_id uuid not null references public.sprints(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  outcome text not null
    check (outcome in ('completed', 'canceled', 'carried_over', 'returned_to_backlog')),
  carried_to_sprint_id uuid references public.sprints(id) on delete set null,
  recorded_at timestamptz not null default now(),
  primary key (sprint_id, ticket_id)
);

create index if not exists idx_sprint_results_ticket on public.sprint_results (ticket_id);

alter table public.sprint_results enable row level security;

-- Read through the sprint. No write policies at all: clients cannot insert, change or
-- delete a sprint's record, only complete_sprint() (SECURITY DEFINER) can.
drop policy if exists "Team members can view sprint results" on public.sprint_results;
create policy "Team members can view sprint results"
  on public.sprint_results for select
  to authenticated
  using (
    exists (
      select 1 from public.sprints s
       where s.id = sprint_results.sprint_id
         and public.can_manage_team_sprints(s.workspace_id, s.team_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 8. start_sprint / complete_sprint
--
-- SECURITY DEFINER, so each authorizes explicitly -- bypassing RLS is the point, and
-- the check inside is what stands in for it.
-- ---------------------------------------------------------------------------
create or replace function public.start_sprint(p_sprint_id uuid)
returns void as $fn$
declare
  v_sprint public.sprints%rowtype;
  v_active record;
begin
  select * into v_sprint from public.sprints where id = p_sprint_id for update;
  if not found then
    raise exception 'Sprint not found' using errcode = 'P0002';
  end if;

  if not public.can_manage_team_sprints(v_sprint.workspace_id, v_sprint.team_id) then
    raise exception 'You are not on this team' using errcode = '42501';
  end if;

  if v_sprint.status <> 'planned' then
    raise exception 'Only a planned sprint can be started' using errcode = '22023';
  end if;

  -- Serialise against a concurrent start for the same team.
  perform 1 from public.teams where id = v_sprint.team_id for update;

  select number, name into v_active
    from public.sprints
   where team_id = v_sprint.team_id and status = 'active'
   limit 1;

  if found then
    raise exception '% is already active. Complete it first.',
      coalesce(v_active.name, 'Sprint ' || v_active.number)
      using errcode = '23505';
  end if;

  perform set_config('app.sprint_transition', 'on', true);
  update public.sprints set status = 'active', started_at = now() where id = p_sprint_id;
  perform set_config('app.sprint_transition', 'off', true);
end;
$fn$ language plpgsql security definer;

create or replace function public.complete_sprint(p_sprint_id uuid, p_carry_to uuid default null)
returns jsonb as $fn$
declare
  v_sprint public.sprints%rowtype;
  v_target public.sprints%rowtype;
  v_counts jsonb;
begin
  select * into v_sprint from public.sprints where id = p_sprint_id for update;
  if not found then
    raise exception 'Sprint not found' using errcode = 'P0002';
  end if;

  if not public.can_manage_team_sprints(v_sprint.workspace_id, v_sprint.team_id) then
    raise exception 'You are not on this team' using errcode = '42501';
  end if;

  if v_sprint.status <> 'active' then
    raise exception 'Only an active sprint can be completed' using errcode = '22023';
  end if;

  if p_carry_to is not null then
    select * into v_target from public.sprints where id = p_carry_to for update;
    if not found or v_target.team_id <> v_sprint.team_id then
      raise exception 'Unfinished tickets can only move to a sprint of the same team'
        using errcode = '22023';
    end if;
    if v_target.status <> 'planned' then
      raise exception 'Unfinished tickets can only move to a planned sprint'
        using errcode = '22023';
    end if;
  end if;

  -- Snapshot first, then move. Trashed tickets are left out of both.
  insert into public.sprint_results (sprint_id, ticket_id, workspace_id, outcome, carried_to_sprint_id)
  select v_sprint.id,
         t.id,
         t.workspace_id,
         case ws.category
           when 'completed' then 'completed'
           when 'canceled'  then 'canceled'
           else case when p_carry_to is null then 'returned_to_backlog' else 'carried_over' end
         end,
         case when ws.category in ('completed', 'canceled') then null else p_carry_to end
    from public.tickets t
    join public.workflow_states ws on ws.id = t.state_id
   where t.sprint_id = v_sprint.id
     and t.deleted_at is null
  on conflict (sprint_id, ticket_id) do nothing;

  -- Finished tickets keep their sprint, so "which sprint was this done in" stays
  -- answerable. Only unfinished ones move.
  update public.tickets t
     set sprint_id = p_carry_to
    from public.workflow_states ws
   where ws.id = t.state_id
     and t.sprint_id = v_sprint.id
     and t.deleted_at is null
     and ws.category not in ('completed', 'canceled');

  perform set_config('app.sprint_transition', 'on', true);
  update public.sprints set status = 'completed', completed_at = now() where id = v_sprint.id;
  perform set_config('app.sprint_transition', 'off', true);

  select jsonb_build_object(
           'completed',           count(*) filter (where outcome = 'completed'),
           'canceled',            count(*) filter (where outcome = 'canceled'),
           'carried_over',        count(*) filter (where outcome = 'carried_over'),
           'returned_to_backlog', count(*) filter (where outcome = 'returned_to_backlog')
         )
    into v_counts
    from public.sprint_results
   where sprint_id = v_sprint.id;

  return v_counts;
end;
$fn$ language plpgsql security definer;

-- Not reachable by anon: a new function's default grant is to PUBLIC.
revoke all on function public.can_manage_team_sprints(uuid, uuid) from public;
revoke all on function public.start_sprint(uuid) from public;
revoke all on function public.complete_sprint(uuid, uuid) from public;
grant execute on function public.can_manage_team_sprints(uuid, uuid) to authenticated;
grant execute on function public.start_sprint(uuid) to authenticated;
grant execute on function public.complete_sprint(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. activity_logs learns 'sprint'. No rows change, so drop and re-add is safe.
-- ---------------------------------------------------------------------------
alter table public.activity_logs drop constraint if exists activity_logs_entity_type_check;
alter table public.activity_logs add constraint activity_logs_entity_type_check
  check (entity_type in ('ticket', 'project', 'test_case', 'comment', 'doc', 'sprint'));

notify pgrst, 'reload schema';

-- Confirm, as one row. Expected: 1 | 1 | 4 | 1 | 2 | 3
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'teams' and column_name = 'sprint_counter')   as teams_sprint_counter,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'tickets' and column_name = 'sprint_id')      as tickets_sprint_id,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'sprints')                                      as sprint_policies,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'sprint_results')                               as result_policies,
  (select count(*) from pg_trigger
    where tgname in ('sprints_before_write', 'tickets_sprint_guard') and not tgisinternal)      as triggers,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('start_sprint', 'complete_sprint', 'can_manage_team_sprints')
      and p.prosecdef)                                                                           as definer_functions;
