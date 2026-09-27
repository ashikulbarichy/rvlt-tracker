-- 018: archive sprints, and delete finished ones.
--
-- Archiving: a completed sprint is archived when someone archives it (archived_at), or
-- automatically 7 days after it completed. The automatic part is a rule the app reads,
-- not a scheduled job -- there is no cron here -- so it needs nothing running:
--
--   archived  =  archived_at is not null
--             or (status = 'completed' and completed_at < now() - 7 days and unarchived_at is null)
--
-- Unarchiving clears archived_at and stamps unarchived_at, which exempts the sprint from
-- the 7-day rule from then on (the same pattern tickets use).
--
-- Deleting: admins can now delete a planned OR a completed sprint (archived or not). An
-- active sprint still has to be completed first. Deleting a completed sprint removes its
-- record (sprint_results, the history log and its velocity) and leaves its finished
-- tickets with no sprint. The delete policy is replaced; nothing else changes.
--
-- To undo:
--   alter table public.sprints drop column if exists archived_at;
--   alter table public.sprints drop column if exists unarchived_at;
--   and restore "Admins can delete planned sprints" from 20260930090000.

alter table public.sprints add column if not exists archived_at timestamptz;
alter table public.sprints add column if not exists unarchived_at timestamptz;

-- Only a completed sprint can be archived.
alter table public.sprints drop constraint if exists sprints_archive_completed_only;
alter table public.sprints add constraint sprints_archive_completed_only
  check (archived_at is null or status = 'completed');

drop policy if exists "Admins can delete planned sprints" on public.sprints;
drop policy if exists "Admins can delete planned or completed sprints" on public.sprints;
create policy "Admins can delete planned or completed sprints"
  on public.sprints for delete
  to authenticated
  using (public.is_workspace_admin(workspace_id) and status in ('planned', 'completed'));

notify pgrst, 'reload schema';

-- Confirm, as one row. Expected: 2 | 1 | 0
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'sprints'
      and column_name in ('archived_at', 'unarchived_at'))                       as archive_cols,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'sprints'
      and policyname = 'Admins can delete planned or completed sprints')         as new_delete_policy,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'sprints'
      and policyname = 'Admins can delete planned sprints')                      as old_delete_policy;
