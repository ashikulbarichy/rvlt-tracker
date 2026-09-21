-- Snapshot taken immediately before migration 004 renames issues -> tickets, adds
-- ticket types, and (in the final 004 migration) drops the estimate column.
-- Timestamped to sort before 20260922091000 so a replay always snapshots first.
--
-- This is a safety net for THIS migration, not a substitute for a real backup. It holds
-- full copies of the four issue tables as they were, so the row data survives even if a
-- rename step has to be undone by hand. It cannot undo
-- `alter table ... drop column estimate` on its own -- but because these are full
-- copies, the estimate values ARE preserved here and can be written back.
--
-- Safe to re-run: each table is dropped and recreated.

create schema if not exists backup;
revoke all on schema backup from anon, authenticated;

-- Full copies. `select *` deliberately: this is the last state of these tables under
-- their old names, and every column matters for a manual restore.
drop table if exists backup.issues_pre_004;
create table backup.issues_pre_004 as
select i.*, now() as snapshot_at from public.issues i;

drop table if exists backup.issue_assignees_pre_004;
create table backup.issue_assignees_pre_004 as
select a.*, now() as snapshot_at from public.issue_assignees a;

drop table if exists backup.issue_comments_pre_004;
create table backup.issue_comments_pre_004 as
select c.*, now() as snapshot_at from public.issue_comments c;

drop table if exists backup.issue_test_cases_pre_004;
create table backup.issue_test_cases_pre_004 as
select tc.*, now() as snapshot_at from public.issue_test_cases tc;

-- The activity log rows whose entity_type this migration rewrites.
drop table if exists backup.activity_logs_issue_pre_004;
create table backup.activity_logs_issue_pre_004 as
select l.id, l.entity_type, l.entity_id, now() as snapshot_at
  from public.activity_logs l
 where l.entity_type = 'issue';

revoke all on all tables in schema backup from anon, authenticated;

-- Confirm the snapshot is populated before running the rename.
select 'issues' as table_name, count(*) as rows from backup.issues_pre_004
union all
select 'issue_assignees', count(*) from backup.issue_assignees_pre_004
union all
select 'issue_comments', count(*) from backup.issue_comments_pre_004
union all
select 'issue_test_cases', count(*) from backup.issue_test_cases_pre_004
union all
select 'activity_logs (entity_type=issue)', count(*) from backup.activity_logs_issue_pre_004;

-- ---------------------------------------------------------------------------
-- Restoring the estimate column, if it is dropped and then wanted back:
--
--   alter table public.tickets add column estimate integer;
--   update public.tickets t
--      set estimate = b.estimate
--     from backup.issues_pre_004 b
--    where b.id = t.id;
--
-- Restoring a whole table needs the column list spelled out, because the live table's
-- columns have been renamed since the snapshot was taken.
-- ---------------------------------------------------------------------------
