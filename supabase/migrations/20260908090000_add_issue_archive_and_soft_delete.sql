-- 001: issue archiving (derived), soft delete, and per-workspace archive window.
-- Spec: specs/001-issue-archive-and-filters/SPEC.md
-- Reverse with the drops listed at the bottom of this file.

-- 1. Per-workspace archive window.
alter table public.workspaces
  add column if not exists archive_after_days integer not null default 7;

alter table public.workspaces
  drop constraint if exists workspaces_archive_after_days_check;
alter table public.workspaces
  add constraint workspaces_archive_after_days_check
  check (archive_after_days between 1 and 365);

-- 2. Issue lifecycle columns.
alter table public.issues add column if not exists closed_at     timestamptz;
alter table public.issues add column if not exists unarchived_at timestamptz;
alter table public.issues add column if not exists deleted_at    timestamptz;
alter table public.issues add column if not exists deleted_by    uuid references auth.users(id) on delete set null;

-- 3. Maintain closed_at from the workflow state's category.
create or replace function public.sync_issue_closed_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_is_closed boolean;
begin
  select category in ('completed', 'canceled')
    into new_is_closed
    from public.workflow_states
   where id = new.state_id;

  if new_is_closed and new.closed_at is null then
    new.closed_at := now();
  elsif not new_is_closed then
    -- Reopening clears both the close date and any archive exemption.
    new.closed_at := null;
    new.unarchived_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_issues_sync_closed_at on public.issues;
create trigger trg_issues_sync_closed_at
  before insert or update of state_id on public.issues
  for each row execute function public.sync_issue_closed_at();

-- 4. Backfill: start the clock now so nothing archives on deploy day.
--    Swap now() for i.updated_at if you want existing closed issues to archive at once.
update public.issues i
   set closed_at = now()
  from public.workflow_states s
 where i.state_id = s.id
   and s.category in ('completed', 'canceled')
   and i.closed_at is null;

-- 5. Indexes for the four buckets.
create index if not exists idx_issues_ws_closed  on public.issues(workspace_id, closed_at);
create index if not exists idx_issues_ws_deleted on public.issues(workspace_id, deleted_at);

-- 6. Permanent delete becomes admin-only. Trash/restore stay under the update policy,
--    which already allows any team member.
drop policy if exists "Members can delete issues" on public.issues;
create policy "Admins can delete issues"
  on public.issues for delete
  to authenticated
  using (public.is_workspace_admin(workspace_id));

-- Reverse:
--   drop policy if exists "Admins can delete issues" on public.issues;
--   create policy "Members can delete issues" on public.issues for delete to authenticated
--     using (public.is_workspace_admin(workspace_id)
--            or (public.is_workspace_member(workspace_id) and public.is_team_member(team_id)));
--   drop trigger if exists trg_issues_sync_closed_at on public.issues;
--   drop function if exists public.sync_issue_closed_at();
--   drop index if exists idx_issues_ws_closed;  drop index if exists idx_issues_ws_deleted;
--   alter table public.issues drop column if exists closed_at, drop column if exists unarchived_at,
--     drop column if exists deleted_at, drop column if exists deleted_by;
--   alter table public.workspaces drop column if exists archive_after_days;
