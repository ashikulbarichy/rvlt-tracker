-- ==============================================================================
-- Add team_members table & Team Isolation RLS
-- Allows admins to assign members to teams.
-- Scopes issues, projects, test cases, and workflow states so members only access
-- items belonging to their assigned team(s), while workspace admins access all.
-- ==============================================================================

-- 0. Reset session role back to admin
RESET ROLE;

-- 1. Create team_members table
create table if not exists public.team_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now() not null,
  primary key (team_id, user_id)
);

create index if not exists idx_team_members_user on public.team_members(workspace_id, user_id);
create index if not exists idx_team_members_team on public.team_members(team_id);

-- 2. Helper function to check if auth.uid() is member of team (recursion-safe plpgsql)
create or replace function public.is_team_member(t_id uuid)
returns boolean as $$
declare
  is_mem boolean;
begin
  select exists (
    select 1 from public.team_members
    where team_id = t_id and user_id = auth.uid()
  ) into is_mem;
  return coalesce(is_mem, false);
end;
$$ language plpgsql stable security definer set search_path = public;

-- 3. RLS for team_members
alter table public.team_members enable row level security;

-- Workspace members can view who is on which team in their workspace
drop policy if exists "Workspace members can view team members" on public.team_members;
create policy "Workspace members can view team members"
  on public.team_members for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

-- Workspace admins can insert team members
drop policy if exists "Admins can add team members" on public.team_members;
create policy "Admins can add team members"
  on public.team_members for insert
  to authenticated
  with check (public.is_workspace_admin(workspace_id));

-- Workspace admins can delete team members
drop policy if exists "Admins can remove team members" on public.team_members;
create policy "Admins can remove team members"
  on public.team_members for delete
  to authenticated
  using (public.is_workspace_admin(workspace_id));

-- 4. Update RLS on public.teams
-- Admins see all teams; members see teams they belong to
drop policy if exists "Members can view teams in workspace" on public.teams;
create policy "Members can view teams in workspace"
  on public.teams for select
  to authenticated
  using (
    public.is_workspace_admin(workspace_id)
    or public.is_team_member(id)
  );

-- 5. Update RLS on public.issues
-- Admins see all issues; members see issues for their assigned teams
drop policy if exists "Members can view issues" on public.issues;
create policy "Members can view issues"
  on public.issues for select
  to authenticated
  using (
    public.is_workspace_admin(workspace_id)
    or (public.is_workspace_member(workspace_id) and public.is_team_member(team_id))
  );

drop policy if exists "Members can insert issues" on public.issues;
create policy "Members can insert issues"
  on public.issues for insert
  to authenticated
  with check (
    public.is_workspace_admin(workspace_id)
    or (public.is_workspace_member(workspace_id) and public.is_team_member(team_id))
  );

drop policy if exists "Members can update issues" on public.issues;
create policy "Members can update issues"
  on public.issues for update
  to authenticated
  using (
    public.is_workspace_admin(workspace_id)
    or (public.is_workspace_member(workspace_id) and public.is_team_member(team_id))
  );

drop policy if exists "Members can delete issues" on public.issues;
create policy "Members can delete issues"
  on public.issues for delete
  to authenticated
  using (
    public.is_workspace_admin(workspace_id)
    or (public.is_workspace_member(workspace_id) and public.is_team_member(team_id))
  );

-- 6. Update RLS on public.projects
drop policy if exists "Members can view projects" on public.projects;
create policy "Members can view projects"
  on public.projects for select
  to authenticated
  using (
    public.is_workspace_admin(workspace_id)
    or (public.is_workspace_member(workspace_id) and public.is_team_member(team_id))
  );

drop policy if exists "Members can insert projects" on public.projects;
create policy "Members can insert projects"
  on public.projects for insert
  to authenticated
  with check (
    public.is_workspace_admin(workspace_id)
    or (public.is_workspace_member(workspace_id) and public.is_team_member(team_id))
  );

drop policy if exists "Members can update projects" on public.projects;
create policy "Members can update projects"
  on public.projects for update
  to authenticated
  using (
    public.is_workspace_admin(workspace_id)
    or (public.is_workspace_member(workspace_id) and public.is_team_member(team_id))
  );

-- 7. Update RLS on public.test_cases
drop policy if exists "Members can view test cases" on public.test_cases;
create policy "Members can view test cases"
  on public.test_cases for select
  to authenticated
  using (
    public.is_workspace_admin(workspace_id)
    or exists (
      select 1 from public.projects p
      join public.team_members tm on tm.team_id = p.team_id
      where p.id = test_cases.project_id and tm.user_id = auth.uid()
    )
  );

drop policy if exists "Members can manage test cases" on public.test_cases;
create policy "Members can manage test cases"
  on public.test_cases for all
  to authenticated
  using (
    public.is_workspace_admin(workspace_id)
    or exists (
      select 1 from public.projects p
      join public.team_members tm on tm.team_id = p.team_id
      where p.id = test_cases.project_id and tm.user_id = auth.uid()
    )
  )
  with check (
    public.is_workspace_admin(workspace_id)
    or exists (
      select 1 from public.projects p
      join public.team_members tm on tm.team_id = p.team_id
      where p.id = test_cases.project_id and tm.user_id = auth.uid()
    )
  );

-- 8. Update RLS on public.workflow_states
drop policy if exists "Members can view workflow states" on public.workflow_states;
create policy "Members can view workflow states"
  on public.workflow_states for select
  to authenticated
  using (
    public.is_workspace_admin(workspace_id)
    or (public.is_workspace_member(workspace_id) and public.is_team_member(team_id))
  );

-- 9. Backfill: Add existing workspace admins to existing teams so they are explicitly in team_members
insert into public.team_members (workspace_id, team_id, user_id)
select t.workspace_id, t.id, wm.user_id
from public.teams t
join public.workspace_members wm on wm.workspace_id = t.workspace_id and wm.role = 'admin'
on conflict do nothing;
