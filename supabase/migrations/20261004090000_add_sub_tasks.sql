-- 016: sub-tasks (agile phase 5).
--
-- tickets.parent_id: a sub-task's story. One level only -- a sub-task has no sub-tasks,
-- and a ticket with sub-tasks cannot become one -- and always within the same team.
--
-- Points stay on the story: a sub-task never carries story points (the points guard
-- clears them), so velocity counts each piece of work once.
--
-- A sub-task works in its story's sprint. It takes the story's sprint when it is created
-- or attached, and moving the story to another sprint (or back to the backlog) takes its
-- open sub-tasks along. Finished sub-tasks stay where they were done, like finished
-- tickets do at sprint completion.
--
-- To undo:
--   drop trigger if exists tickets_parent_guard on public.tickets;
--   drop trigger if exists tickets_subtasks_follow on public.tickets;
--   drop function if exists public.tickets_parent_guard();
--   drop function if exists public.tickets_subtasks_follow();
--   alter table public.tickets drop column if exists parent_id;
--   -- and re-run tickets_story_points_guard + its trigger from 20261002090000.

alter table public.tickets
  add column if not exists parent_id uuid references public.tickets(id) on delete set null;

create index if not exists idx_tickets_parent on public.tickets (parent_id) where parent_id is not null;

-- ---------------------------------------------------------------------------
-- 1. Shape rules, and the sprint a sub-task starts in
-- ---------------------------------------------------------------------------
create or replace function public.tickets_parent_guard()
returns trigger as $fn$
declare
  v_parent record;
begin
  -- A story changing team would leave its sub-tasks in the old one.
  if tg_op = 'UPDATE' and new.team_id is distinct from old.team_id and new.parent_id is null
     and exists (select 1 from public.tickets c where c.parent_id = new.id and c.deleted_at is null) then
    raise exception 'Move or detach this ticket''s sub-tasks before changing its team' using errcode = '23514';
  end if;

  if new.parent_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.parent_id is not distinct from old.parent_id
     and new.team_id is not distinct from old.team_id then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'A ticket cannot be its own sub-task' using errcode = '23514';
  end if;

  select id, team_id, parent_id, sprint_id into v_parent
    from public.tickets
   where id = new.parent_id;

  if not found then
    raise exception 'That parent ticket does not exist' using errcode = '23503';
  end if;
  if v_parent.team_id <> new.team_id then
    raise exception 'A sub-task must be on the same team as its parent' using errcode = '23514';
  end if;
  if v_parent.parent_id is not null then
    raise exception 'Sub-tasks cannot have sub-tasks of their own' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and exists (select 1 from public.tickets c where c.parent_id = new.id) then
    raise exception 'A ticket with sub-tasks cannot become a sub-task' using errcode = '23514';
  end if;

  -- Joining a story means working in its sprint (the sprint guard, which runs after this
  -- one, still refuses a completed sprint -- then the sub-task stays in the backlog).
  if v_parent.sprint_id is not null
     and exists (select 1 from public.sprints s where s.id = v_parent.sprint_id and s.status <> 'completed') then
    new.sprint_id := v_parent.sprint_id;
  end if;

  return new;
end;
$fn$ language plpgsql security definer;

-- Named to sort before tickets_sprint_guard: BEFORE triggers fire in name order, and the
-- sprint guard must check the sprint this one picked.
drop trigger if exists tickets_parent_guard on public.tickets;
create trigger tickets_parent_guard
  before insert or update of parent_id, team_id on public.tickets
  for each row execute function public.tickets_parent_guard();

-- ---------------------------------------------------------------------------
-- 2. Open sub-tasks follow their story between sprints
-- ---------------------------------------------------------------------------
create or replace function public.tickets_subtasks_follow()
returns trigger as $fn$
begin
  -- complete_sprint moves open sub-tasks itself, with everything else unfinished.
  if coalesce(current_setting('app.sprint_completing', true), '') = 'on' then
    return null;
  end if;

  if new.parent_id is null and new.sprint_id is distinct from old.sprint_id then
    update public.tickets c
       set sprint_id = new.sprint_id
      from public.workflow_states ws
     where c.parent_id = new.id
       and c.deleted_at is null
       and ws.id = c.state_id
       and ws.category not in ('completed', 'canceled')
       and c.sprint_id is distinct from new.sprint_id;
  end if;
  return null;
end;
$fn$ language plpgsql security definer;

drop trigger if exists tickets_subtasks_follow on public.tickets;
create trigger tickets_subtasks_follow
  after update of sprint_id on public.tickets
  for each row execute function public.tickets_subtasks_follow();

-- ---------------------------------------------------------------------------
-- 3. Points guard from 20261002090000, plus: sub-tasks carry no points
-- ---------------------------------------------------------------------------
create or replace function public.tickets_story_points_guard()
returns trigger as $fn$
declare
  v_takes boolean;
begin
  select takes_story_points into v_takes
    from public.ticket_types
   where id = new.type_id;

  -- A type without points, or a sub-task, holds none. Not an estimate, so no admin check.
  if not coalesce(v_takes, false) or new.parent_id is not null then
    new.story_points := null;
    return new;
  end if;

  if (tg_op = 'INSERT' and new.story_points is not null)
     or (tg_op = 'UPDATE' and new.story_points is distinct from old.story_points) then
    if auth.uid() is not null and not public.is_workspace_admin(new.workspace_id) then
      raise exception 'Only a workspace admin can set story points' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$fn$ language plpgsql security definer;

drop trigger if exists tickets_story_points_guard on public.tickets;
create trigger tickets_story_points_guard
  before insert or update of story_points, type_id, parent_id on public.tickets
  for each row execute function public.tickets_story_points_guard();

-- Clearing points above changes story_points without it being in the SET list, so the
-- sprint log must also listen for parent_id to record it.
drop trigger if exists tickets_sprint_log on public.tickets;
create trigger tickets_sprint_log
  after insert or update of sprint_id, story_points, state_id, type_id, deleted_at, parent_id on public.tickets
  for each row execute function public.tickets_sprint_log();

notify pgrst, 'reload schema';

-- Confirm, as one row. Expected: 1 | 4
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'tickets' and column_name = 'parent_id') as parent_col,
  (select count(*) from pg_trigger
    where tgname in ('tickets_parent_guard', 'tickets_subtasks_follow',
                     'tickets_story_points_guard', 'tickets_sprint_log')
      and not tgisinternal)                                                                as triggers;
