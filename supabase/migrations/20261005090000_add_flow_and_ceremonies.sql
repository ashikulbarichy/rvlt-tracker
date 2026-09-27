-- 017: flow and ceremonies (agile phase 6).
--
-- 1. workflow_states.wip_limit: the most tickets a status column should hold on the
--    sprint board. Advisory -- the board flags a column over its limit, nothing is
--    refused. Statuses are workspace-level (003), so the limit is too; admins set it
--    under the existing workflow_states policies.
--
-- 2. ticket_blocks: "blocker_id blocks blocked_id". Visible and editable by whoever can
--    see both tickets under the tickets policies (the subqueries below run with the
--    caller's RLS). Same workspace, no self-links, no direct two-way block.
--
-- 3. teams.sprint_length_days: when set, starting a sprint plans the next one right
--    after it, same length, so there is always a sprint to carry unfinished work into.
--    Skipped when a planned sprint already covers those dates.
--
-- 4. sprints.retro_doc_id: the sprint's retrospective whiteboard.
--
-- To undo:
--   drop trigger if exists sprints_plan_next on public.sprints;
--   drop function if exists public.sprints_plan_next();
--   drop trigger if exists ticket_blocks_guard on public.ticket_blocks;
--   drop function if exists public.ticket_blocks_guard();
--   drop table if exists public.ticket_blocks;
--   alter table public.sprints drop column if exists retro_doc_id;
--   alter table public.teams drop column if exists sprint_length_days;
--   alter table public.workflow_states drop column if exists wip_limit;

-- ---------------------------------------------------------------------------
-- 1. WIP limits
-- ---------------------------------------------------------------------------
alter table public.workflow_states
  add column if not exists wip_limit integer
  constraint workflow_states_wip_limit_positive check (wip_limit is null or wip_limit > 0);

-- ---------------------------------------------------------------------------
-- 2. Blocked-by links
-- ---------------------------------------------------------------------------
create table if not exists public.ticket_blocks (
  blocker_id uuid not null references public.tickets(id) on delete cascade,
  blocked_id uuid not null references public.tickets(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint ticket_blocks_not_self check (blocker_id <> blocked_id)
);

create index if not exists idx_ticket_blocks_blocked on public.ticket_blocks (blocked_id);

create or replace function public.ticket_blocks_guard()
returns trigger as $fn$
begin
  if exists (select 1 from public.tickets t
              where t.id in (new.blocker_id, new.blocked_id)
                and t.workspace_id <> new.workspace_id) then
    raise exception 'Both tickets must be in this workspace' using errcode = '23514';
  end if;
  if exists (select 1 from public.ticket_blocks b
              where b.blocker_id = new.blocked_id and b.blocked_id = new.blocker_id) then
    raise exception 'These tickets already block each other the other way round' using errcode = '23514';
  end if;
  new.created_by := auth.uid();
  return new;
end;
$fn$ language plpgsql security definer;

drop trigger if exists ticket_blocks_guard on public.ticket_blocks;
create trigger ticket_blocks_guard
  before insert on public.ticket_blocks
  for each row execute function public.ticket_blocks_guard();

alter table public.ticket_blocks enable row level security;

drop policy if exists "Members can view ticket blocks" on public.ticket_blocks;
create policy "Members can view ticket blocks"
  on public.ticket_blocks for select
  to authenticated
  using (
    exists (select 1 from public.tickets t where t.id = ticket_blocks.blocker_id)
    and exists (select 1 from public.tickets t where t.id = ticket_blocks.blocked_id)
  );

drop policy if exists "Members can add ticket blocks" on public.ticket_blocks;
create policy "Members can add ticket blocks"
  on public.ticket_blocks for insert
  to authenticated
  with check (
    public.is_workspace_member(workspace_id)
    and exists (select 1 from public.tickets t where t.id = ticket_blocks.blocker_id)
    and exists (select 1 from public.tickets t where t.id = ticket_blocks.blocked_id)
  );

drop policy if exists "Members can remove ticket blocks" on public.ticket_blocks;
create policy "Members can remove ticket blocks"
  on public.ticket_blocks for delete
  to authenticated
  using (
    exists (select 1 from public.tickets t where t.id = ticket_blocks.blocker_id)
    and exists (select 1 from public.tickets t where t.id = ticket_blocks.blocked_id)
  );

-- ---------------------------------------------------------------------------
-- 3. Repeating sprints
-- ---------------------------------------------------------------------------
alter table public.teams
  add column if not exists sprint_length_days integer
  constraint teams_sprint_length_range check (sprint_length_days is null or sprint_length_days between 1 and 60);

create or replace function public.sprints_plan_next()
returns trigger as $fn$
declare
  v_length integer;
  v_start date;
  v_end date;
begin
  if new.status <> 'active' or old.status = 'active' then
    return null;
  end if;

  select sprint_length_days into v_length from public.teams where id = new.team_id;
  if v_length is null then
    return null;
  end if;

  v_start := new.end_date + 1;
  v_end := v_start + v_length - 1;

  -- Already planned (or anything else on those dates): leave it to the team.
  if exists (select 1 from public.sprints s
              where s.team_id = new.team_id
                and s.id <> new.id
                and daterange(s.start_date, s.end_date, '[]') && daterange(v_start, v_end, '[]')) then
    return null;
  end if;

  -- number, status and created_by are set by sprints_before_write.
  insert into public.sprints (workspace_id, team_id, start_date, end_date)
  values (new.workspace_id, new.team_id, v_start, v_end);
  return null;
end;
$fn$ language plpgsql security definer;

drop trigger if exists sprints_plan_next on public.sprints;
create trigger sprints_plan_next
  after update of status on public.sprints
  for each row execute function public.sprints_plan_next();

-- ---------------------------------------------------------------------------
-- 4. Retro whiteboard
-- ---------------------------------------------------------------------------
alter table public.sprints
  add column if not exists retro_doc_id uuid references public.docs(id) on delete set null;

notify pgrst, 'reload schema';

-- Confirm, as one row. Expected: 1 | 3 | 1 | 1 | 2
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'workflow_states' and column_name = 'wip_limit')   as wip_col,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'ticket_blocks')                                    as block_policies,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'teams' and column_name = 'sprint_length_days')  as cadence_col,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'sprints' and column_name = 'retro_doc_id')      as retro_col,
  (select count(*) from pg_trigger
    where tgname in ('ticket_blocks_guard', 'sprints_plan_next') and not tgisinternal)              as triggers;
