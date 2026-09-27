-- 014: story points and the sprint history log (agile phases 1 + 2).
--
-- Story points: tickets.story_points, one of 1, 2, 3, 5, 8, 13, or null for "not
-- estimated". Only ticket types with takes_story_points carry points (Bug does not), and
-- only a workspace admin can set or change them. Both rules live in one trigger, so no
-- screen or script can get around them. Changing a ticket to a type without points clears
-- its points, whoever makes the change -- that is the rule following the type, not an
-- estimate.
--
-- Sprint log: sprint_ticket_events, one row every time a ticket's standing in a sprint
-- changes (joins, leaves, is re-estimated, changes state, is trashed). Each row is the
-- ticket's full standing at that moment, so a burndown for any day is "the latest row
-- per ticket before the end of that day". Written only by a trigger; clients read it.
--
-- start_sprint now records what the team committed to (points and tickets), and
-- complete_sprint records each ticket's points in sprint_results, so velocity never moves
-- when someone re-estimates an old ticket.
--
-- Unrelated to tickets.estimate, which 20260922093000 drops. This does not touch it.
--
-- To undo:
--   drop trigger if exists tickets_sprint_log on public.tickets;
--   drop trigger if exists tickets_story_points_guard on public.tickets;
--   drop function if exists public.tickets_sprint_log();
--   drop function if exists public.tickets_story_points_guard();
--   drop table if exists public.sprint_ticket_events;
--   alter table public.sprint_results drop column if exists story_points;
--   alter table public.sprints drop column if exists committed_points;
--   alter table public.sprints drop column if exists committed_count;
--   alter table public.tickets drop column if exists story_points;
--   alter table public.ticket_types drop column if exists takes_story_points;
--   -- and re-run start_sprint / complete_sprint / seed_default_ticket_types from
--   -- 20260930090000 and 20260922092000.

-- ---------------------------------------------------------------------------
-- 1. Which types carry points. Bug does not; every other type does, including any the
--    workspace added (Documentation etc.). Admins can change it per type.
-- ---------------------------------------------------------------------------
alter table public.ticket_types
  add column if not exists takes_story_points boolean not null default true;

update public.ticket_types
   set takes_story_points = false
 where lower(btrim(name)) = 'bug';

-- New workspaces: same seed as 004, with Bug not taking points.
create or replace function public.seed_default_ticket_types(p_workspace_id uuid)
returns void as $$
begin
  insert into public.ticket_types (workspace_id, name, color, position, counts_toward_progress, is_default, takes_story_points)
  values
    (p_workspace_id, 'Bug',         '#B55151', 0, false, false, false),
    (p_workspace_id, 'Feature',     '#1ED760', 1, true,  true,  true),
    (p_workspace_id, 'Improvement', '#4A7BB5', 2, false, false, true)
  on conflict do nothing;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- 2. tickets.story_points
-- ---------------------------------------------------------------------------
alter table public.tickets
  add column if not exists story_points smallint
  constraint tickets_story_points_scale check (story_points in (1, 2, 3, 5, 8, 13));

create or replace function public.tickets_story_points_guard()
returns trigger as $fn$
declare
  v_takes boolean;
begin
  select takes_story_points into v_takes
    from public.ticket_types
   where id = new.type_id;

  -- A type without points holds none. Not an estimate, so no admin check.
  if not coalesce(v_takes, false) then
    new.story_points := null;
    return new;
  end if;

  if (tg_op = 'INSERT' and new.story_points is not null)
     or (tg_op = 'UPDATE' and new.story_points is distinct from old.story_points) then
    -- auth.uid() is null only for the SQL editor and service jobs, which are trusted.
    if auth.uid() is not null and not public.is_workspace_admin(new.workspace_id) then
      raise exception 'Only a workspace admin can set story points' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$fn$ language plpgsql security definer;

drop trigger if exists tickets_story_points_guard on public.tickets;
create trigger tickets_story_points_guard
  before insert or update of story_points, type_id on public.tickets
  for each row execute function public.tickets_story_points_guard();

-- ---------------------------------------------------------------------------
-- 3. sprint_ticket_events
-- ---------------------------------------------------------------------------
create table if not exists public.sprint_ticket_events (
  id bigint generated always as identity primary key,
  sprint_id uuid not null references public.sprints(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- false once the ticket leaves the sprint or is trashed.
  in_sprint boolean not null,
  -- The ticket's points at that moment; null when unestimated or its type takes none.
  story_points smallint,
  -- The ticket's workflow category at that moment.
  category text not null,
  occurred_at timestamptz not null default now(),
  actor_id uuid references auth.users(id) on delete set null
);

create index if not exists idx_sprint_ticket_events_sprint
  on public.sprint_ticket_events (sprint_id, occurred_at);
create index if not exists idx_sprint_ticket_events_ticket
  on public.sprint_ticket_events (ticket_id);

alter table public.sprint_ticket_events enable row level security;

-- Read through the sprint, like sprint_results. No write policies: only the trigger
-- (SECURITY DEFINER) writes, so the history cannot be edited from the client.
drop policy if exists "Team members can view sprint events" on public.sprint_ticket_events;
create policy "Team members can view sprint events"
  on public.sprint_ticket_events for select
  to authenticated
  using (
    exists (
      select 1 from public.sprints s
       where s.id = sprint_ticket_events.sprint_id
         and public.can_manage_team_sprints(s.workspace_id, s.team_id)
    )
  );

create or replace function public.tickets_sprint_log()
returns trigger as $fn$
declare
  v_old_category text;
  v_new_category text;
begin
  -- complete_sprint moving unfinished work on is not a scope change; its outcome is in
  -- sprint_results. Logging it would drop the last day of the burndown to zero.
  if coalesce(current_setting('app.sprint_completing', true), '') = 'on' then
    return null;
  end if;

  if tg_op = 'UPDATE'
     and new.sprint_id is not distinct from old.sprint_id
     and new.story_points is not distinct from old.story_points
     and new.state_id is not distinct from old.state_id
     and new.deleted_at is not distinct from old.deleted_at then
    return null;
  end if;

  select category into v_new_category from public.workflow_states where id = new.state_id;

  -- Left a sprint (moved, or back to the backlog).
  if tg_op = 'UPDATE' and old.sprint_id is not null
     and old.sprint_id is distinct from new.sprint_id then
    select category into v_old_category from public.workflow_states where id = old.state_id;
    insert into public.sprint_ticket_events
      (sprint_id, ticket_id, workspace_id, in_sprint, story_points, category, actor_id)
    select old.sprint_id, old.id, old.workspace_id, false, old.story_points,
           coalesce(v_old_category, 'backlog'), auth.uid()
      from public.sprints s
     where s.id = old.sprint_id and s.status <> 'completed';
  end if;

  -- Joined, or changed while in it. A completed sprint's history is closed.
  if new.sprint_id is not null then
    insert into public.sprint_ticket_events
      (sprint_id, ticket_id, workspace_id, in_sprint, story_points, category, actor_id)
    select new.sprint_id, new.id, new.workspace_id, new.deleted_at is null, new.story_points,
           coalesce(v_new_category, 'backlog'), auth.uid()
      from public.sprints s
     where s.id = new.sprint_id and s.status <> 'completed';
  end if;

  return null;
end;
$fn$ language plpgsql security definer;

drop trigger if exists tickets_sprint_log on public.tickets;
-- type_id is listed because changing to a type without points clears them in the
-- guard, and a column the guard changes does not count toward UPDATE OF.
create trigger tickets_sprint_log
  after insert or update of sprint_id, story_points, state_id, type_id, deleted_at on public.tickets
  for each row execute function public.tickets_sprint_log();

-- Baseline for sprints already planned or running: where every ticket stands now. An
-- active sprint's burndown starts from here; there is no earlier history to recover.
insert into public.sprint_ticket_events
  (sprint_id, ticket_id, workspace_id, in_sprint, story_points, category)
select t.sprint_id, t.id, t.workspace_id, true, t.story_points, ws.category
  from public.tickets t
  join public.sprints s on s.id = t.sprint_id
  join public.workflow_states ws on ws.id = t.state_id
 where s.status in ('planned', 'active')
   and t.deleted_at is null
   and not exists (select 1 from public.sprint_ticket_events e where e.ticket_id = t.id and e.sprint_id = t.sprint_id);

-- ---------------------------------------------------------------------------
-- 4. What a sprint committed to and delivered, frozen
-- ---------------------------------------------------------------------------
-- Null for sprints started before this migration: their commitment was never recorded.
alter table public.sprints add column if not exists committed_points integer;
alter table public.sprints add column if not exists committed_count integer;

alter table public.sprint_results add column if not exists story_points smallint;

-- start_sprint: body from 20260930090000, plus the commitment snapshot.
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
  update public.sprints
     set status = 'active',
         started_at = now(),
         committed_points = (select coalesce(sum(story_points), 0) from public.tickets
                              where sprint_id = p_sprint_id and deleted_at is null),
         committed_count  = (select count(*) from public.tickets
                              where sprint_id = p_sprint_id and deleted_at is null)
   where id = p_sprint_id;
  perform set_config('app.sprint_transition', 'off', true);
end;
$fn$ language plpgsql security definer;

-- complete_sprint: body from 20260930090000, plus points in the snapshot and the
-- app.sprint_completing flag around the move.
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

  insert into public.sprint_results (sprint_id, ticket_id, workspace_id, outcome, carried_to_sprint_id, story_points)
  select v_sprint.id,
         t.id,
         t.workspace_id,
         case ws.category
           when 'completed' then 'completed'
           when 'canceled'  then 'canceled'
           else case when p_carry_to is null then 'returned_to_backlog' else 'carried_over' end
         end,
         case when ws.category in ('completed', 'canceled') then null else p_carry_to end,
         t.story_points
    from public.tickets t
    join public.workflow_states ws on ws.id = t.state_id
   where t.sprint_id = v_sprint.id
     and t.deleted_at is null
  on conflict (sprint_id, ticket_id) do nothing;

  -- The flag silences the log for this one statement: leaving this sprint is recorded
  -- in sprint_results, not as a scope change.
  perform set_config('app.sprint_completing', 'on', true);
  update public.tickets t
     set sprint_id = p_carry_to
    from public.workflow_states ws
   where ws.id = t.state_id
     and t.sprint_id = v_sprint.id
     and t.deleted_at is null
     and ws.category not in ('completed', 'canceled');
  perform set_config('app.sprint_completing', 'off', true);

  -- Their arrival in the carry-to sprint, logged by hand since the flag hid it.
  if p_carry_to is not null then
    insert into public.sprint_ticket_events
      (sprint_id, ticket_id, workspace_id, in_sprint, story_points, category, actor_id)
    select p_carry_to, t.id, t.workspace_id, true, t.story_points, ws.category, auth.uid()
      from public.tickets t
      join public.workflow_states ws on ws.id = t.state_id
     where t.sprint_id = p_carry_to
       and t.deleted_at is null
       and exists (select 1 from public.sprint_results r
                    where r.sprint_id = v_sprint.id and r.ticket_id = t.id
                      and r.outcome = 'carried_over');
  end if;

  perform set_config('app.sprint_transition', 'on', true);
  update public.sprints set status = 'completed', completed_at = now() where id = v_sprint.id;
  perform set_config('app.sprint_transition', 'off', true);

  select jsonb_build_object(
           'completed',           count(*) filter (where outcome = 'completed'),
           'canceled',            count(*) filter (where outcome = 'canceled'),
           'carried_over',        count(*) filter (where outcome = 'carried_over'),
           'returned_to_backlog', count(*) filter (where outcome = 'returned_to_backlog'),
           'completed_points',    coalesce(sum(story_points) filter (where outcome = 'completed'), 0)
         )
    into v_counts
    from public.sprint_results
   where sprint_id = v_sprint.id;

  return v_counts;
end;
$fn$ language plpgsql security definer;

revoke all on function public.start_sprint(uuid) from public;
revoke all on function public.complete_sprint(uuid, uuid) from public;
grant execute on function public.start_sprint(uuid) to authenticated;
grant execute on function public.complete_sprint(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

-- Confirm, as one row. Expected: 1 | 1 | 2 | 2 | 1 | 1 | 0
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'tickets' and column_name = 'story_points')        as tickets_points,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'ticket_types' and column_name = 'takes_story_points') as type_flag,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'sprints'
      and column_name in ('committed_points', 'committed_count'))                                     as sprint_commit_cols,
  (select count(*) from pg_trigger
    where tgname in ('tickets_story_points_guard', 'tickets_sprint_log') and not tgisinternal)        as triggers,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'sprint_ticket_events')                              as event_policies,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'sprint_results' and column_name = 'story_points') as result_points,
  (select count(*) from public.ticket_types
    where lower(btrim(name)) = 'bug' and takes_story_points)                                          as bugs_with_points;
