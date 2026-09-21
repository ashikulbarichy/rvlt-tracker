-- Snapshot taken immediately before migration 003 collapses per-team workflow states.
-- Timestamped to sort before 20260921130000 so a replay always snapshots first.
--
-- This is a safety net for THIS migration, not a substitute for a real backup: it can
-- restore which status each issue had and what the status rows looked like, but it
-- cannot undo `alter table ... drop column team_id`. For a true restore use pg_dump.
--
-- Safe to re-run: each table is dropped and recreated.

-- A dedicated schema, because PostgREST only exposes `public` (and graphql_public) by
-- default. Putting snapshots in `public` would publish every row through the API, where
-- a table with no RLS policies is readable by any authenticated user.
create schema if not exists backup;
revoke all on schema backup from anon, authenticated;

-- Full copy of the status rows, including team_id while it still exists.
drop table if exists backup.workflow_states_pre_003;
create table backup.workflow_states_pre_003 as
select ws.*, now() as snapshot_at
  from public.workflow_states ws;

-- Which status each issue pointed at, plus the lifecycle columns 003 could disturb.
drop table if exists backup.issues_state_pre_003;
create table backup.issues_state_pre_003 as
select i.id,
       i.workspace_id,
       i.team_id,
       i.state_id,
       i.closed_at,
       i.unarchived_at,
       now() as snapshot_at
  from public.issues i;

revoke all on all tables in schema backup from anon, authenticated;

-- Confirm the snapshot is populated before running 003.
select 'workflow_states' as table_name, count(*) as rows from backup.workflow_states_pre_003
union all
select 'issues', count(*) from backup.issues_state_pre_003;

-- ---------------------------------------------------------------------------
-- Partial rollback, if 003 goes wrong but the status rows still exist:
--
--   update public.issues i
--      set state_id = b.state_id
--     from backup.issues_state_pre_003 b
--    where b.id = i.id
--      and i.state_id is distinct from b.state_id;
--
-- If 003 already deleted status rows, reinsert them from the snapshot first (the
-- team_id column will no longer exist, so select the columns explicitly), then run the
-- update above. Anything beyond that needs the pg_dump restore.
-- ---------------------------------------------------------------------------
