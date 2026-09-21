-- 004 step 2: rename issues -> tickets throughout the database.
--
-- Postgres carries indexes, constraints, triggers, policies and grants along with a
-- table rename, so the data side is safe. What does NOT follow automatically:
--   * function BODIES that name a renamed column (set_issue_identifier does)
--   * object NAMES, which keep saying "issue" until renamed explicitly
--   * PostgREST's cached schema, which must be told to reload
--
-- Run 20260922090000_snapshot_before_004.sql first.
--
-- This is a hard cutover: the moment it commits, a browser running the old JS gets 404s
-- from PostgREST. Deploy the matching build at the same time.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
alter table public.issues            rename to tickets;
alter table public.issue_assignees   rename to ticket_assignees;
alter table public.issue_comments    rename to ticket_comments;
alter table public.issue_test_cases  rename to ticket_test_cases;

-- ---------------------------------------------------------------------------
-- 2. Columns
-- ---------------------------------------------------------------------------
alter table public.tickets            rename column issue_number to ticket_number;
alter table public.ticket_assignees   rename column issue_id     to ticket_id;
alter table public.ticket_comments    rename column issue_id     to ticket_id;
alter table public.ticket_test_cases  rename column issue_id     to ticket_id;

-- The workspace prefix is a user-set value (default 'XXX') that feeds the identifier
-- [WS_PREFIX]-[TEAM_KEY]-[NUMBER]. Renaming the column does not change a single
-- rendered identifier.
alter table public.workspaces rename column issue_prefix  to ticket_prefix;
alter table public.teams      rename column issue_counter to ticket_counter;

-- ---------------------------------------------------------------------------
-- 3. set_ticket_identifier -- must be recreated, not renamed: the body references
--    teams.issue_counter and NEW.issue_number, both of which no longer exist.
-- ---------------------------------------------------------------------------
drop trigger if exists trigger_set_issue_identifier on public.tickets;
drop function if exists public.set_issue_identifier();

create or replace function public.set_ticket_identifier()
returns trigger as $$
declare
  v_ws_prefix text;
  v_team_key text;
  v_num integer;
begin
  select coalesce(ticket_prefix, 'XXX')
    into v_ws_prefix
    from public.workspaces
   where id = new.workspace_id;

  if v_ws_prefix is null or v_ws_prefix = '' then
    v_ws_prefix := 'XXX';
  end if;

  if new.team_id is not null then
    update public.teams
       set ticket_counter = ticket_counter + 1
     where id = new.team_id
    returning key, ticket_counter into v_team_key, v_num;

    new.ticket_number := v_num;
    new.identifier := upper(v_ws_prefix) || '-' || upper(coalesce(v_team_key, 'DEV')) || '-' || lpad(v_num::text, 2, '0');
  else
    new.ticket_number := coalesce(new.ticket_number, 1);
    new.identifier := upper(v_ws_prefix) || '-' || lpad(new.ticket_number::text, 2, '0');
  end if;

  return new;
end;
$$ language plpgsql security definer;

create trigger trigger_set_ticket_identifier
  before insert on public.tickets
  for each row
  execute function public.set_ticket_identifier();

-- ---------------------------------------------------------------------------
-- 4. sync_ticket_closed_at -- the body only touches state_id/closed_at/unarchived_at,
--    none of which were renamed, so a plain rename is enough here.
-- ---------------------------------------------------------------------------
alter function public.sync_issue_closed_at() rename to sync_ticket_closed_at;
alter trigger trg_issues_sync_closed_at on public.tickets rename to trg_tickets_sync_closed_at;

-- ---------------------------------------------------------------------------
-- 5. Cosmetic renames: indexes, constraints and policies whose names still say
--    "issue". Driven off the catalog rather than a hand-written list, so nothing is
--    missed and nothing is guessed wrong.
-- ---------------------------------------------------------------------------
do $$
declare r record; new_name text;
begin
  -- Indexes (including the ones backing unique/primary key constraints).
  for r in
    select indexname from pg_indexes
     where schemaname = 'public' and indexname like '%issue%'
  loop
    new_name := replace(r.indexname, 'issue', 'ticket');
    if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = new_name) then
      execute format('alter index public.%I rename to %I', r.indexname, new_name);
    end if;
  end loop;

  -- Constraints (foreign keys, checks) on the renamed tables.
  for r in
    select c.conname, t.relname
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and c.conname like '%issue%'
       and t.relname in ('tickets', 'ticket_assignees', 'ticket_comments', 'ticket_test_cases')
  loop
    new_name := replace(r.conname, 'issue', 'ticket');
    execute format('alter table public.%I rename constraint %I to %I', r.relname, r.conname, new_name);
  end loop;

  -- Policy names.
  for r in
    select policyname, tablename from pg_policies
     where schemaname = 'public' and policyname ilike '%issue%'
  loop
    new_name := replace(replace(r.policyname, 'issue', 'ticket'), 'Issue', 'Ticket');
    execute format('alter policy %I on public.%I rename to %I', r.policyname, r.tablename, new_name);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Activity log: the entity_type enum carried the literal 'issue'.
-- ---------------------------------------------------------------------------
-- Order matters: the existing constraint only permits 'issue', so the rows cannot be
-- updated until it is gone. Drop, then update, then re-add.
do $$
declare v_conname text;
begin
  select c.conname into v_conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public' and t.relname = 'activity_logs'
     and c.contype = 'c'
     and pg_get_constraintdef(c.oid) ilike '%entity_type%';

  if v_conname is not null then
    execute format('alter table public.activity_logs drop constraint %I', v_conname);
  end if;
end $$;

update public.activity_logs set entity_type = 'ticket' where entity_type = 'issue';

alter table public.activity_logs
  add constraint activity_logs_entity_type_check
  check (entity_type in ('ticket', 'project', 'test_case', 'comment'));

-- ---------------------------------------------------------------------------
-- 7. PostgREST caches the schema. Without this it keeps 404ing `tickets`.
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';

-- Confirm.
select 'tickets' as table_name, count(*) as rows from public.tickets
union all
select 'ticket_assignees', count(*) from public.ticket_assignees
union all
select 'ticket_comments', count(*) from public.ticket_comments
union all
select 'ticket_test_cases', count(*) from public.ticket_test_cases;
