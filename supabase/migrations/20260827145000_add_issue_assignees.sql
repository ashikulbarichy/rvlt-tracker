-- ==============================================================================
-- Add issue_assignees table for Multiple Assignees per Task / Issue
-- ==============================================================================

-- 0. Reset session role back to admin
RESET ROLE;

-- 1. Create issue_assignees join table
create table if not exists public.issue_assignees (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  issue_id uuid not null references public.issues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now() not null,
  primary key (issue_id, user_id)
);

create index if not exists idx_issue_assignees_issue on public.issue_assignees(issue_id);
create index if not exists idx_issue_assignees_user on public.issue_assignees(workspace_id, user_id);

-- 2. RLS for issue_assignees
alter table public.issue_assignees enable row level security;

drop policy if exists "Members can view issue assignees" on public.issue_assignees;
create policy "Members can view issue assignees"
  on public.issue_assignees for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists "Members can assign users to issues" on public.issue_assignees;
create policy "Members can assign users to issues"
  on public.issue_assignees for insert
  to authenticated
  with check (public.is_workspace_member(workspace_id));

drop policy if exists "Members can unassign users from issues" on public.issue_assignees;
create policy "Members can unassign users from issues"
  on public.issue_assignees for delete
  to authenticated
  using (public.is_workspace_member(workspace_id));

-- 3. Backfill existing single assignees into issue_assignees table
insert into public.issue_assignees (workspace_id, issue_id, user_id)
select workspace_id, id, assignee_id
from public.issues
where assignee_id is not null
on conflict do nothing;
