-- ==============================================================================
-- RUM TRACKER: Initial Schema Migration
-- Includes: Workspaces, Members, Teams, Workflow States, Projects, Issues,
--           Test Cases, Comments, Activity Logs, Notifications, Profiles & RLS.
-- ==============================================================================

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. PROFILES (Mirror of auth.users for display/assignee lookups)
-- ------------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.profiles enable row level security;

create policy "Public profiles are viewable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- Trigger to auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(excluded.full_name, public.profiles.full_name),
      avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
      updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update on auth.users
  for each row execute function public.handle_new_user();


-- ------------------------------------------------------------------------------
-- 2. WORKSPACES & WORKSPACE MEMBERS
-- ------------------------------------------------------------------------------
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'member')) default 'member',
  joined_at timestamptz default now() not null,
  primary key (workspace_id, user_id)
);

create index if not exists idx_workspace_members_user on public.workspace_members(user_id, workspace_id);

-- RLS Helper functions
create or replace function public.is_workspace_member(ws_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws_id and user_id = auth.uid()
  );
$$ language sql stable security definer;

create or replace function public.is_workspace_admin(ws_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws_id and user_id = auth.uid() and role = 'admin'
  );
$$ language sql stable security definer;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

-- Workspace Policies
create policy "Workspace members can read their workspace"
  on public.workspaces for select
  to authenticated
  using (public.is_workspace_member(id));

create policy "Authenticated users can create a workspace"
  on public.workspaces for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "Workspace admins can update their workspace"
  on public.workspaces for update
  to authenticated
  using (public.is_workspace_admin(id));

create policy "Workspace admins can delete their workspace"
  on public.workspaces for delete
  to authenticated
  using (public.is_workspace_admin(id));

-- Workspace Members Policies
create policy "Members can view members in their workspace"
  on public.workspace_members for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Admins can add or update members in their workspace"
  on public.workspace_members for insert
  to authenticated
  with check (
    public.is_workspace_admin(workspace_id) 
    or (auth.uid() = user_id and not exists (select 1 from public.workspace_members where workspace_id = workspace_members.workspace_id))
  );

create policy "Admins can update member roles in their workspace"
  on public.workspace_members for update
  to authenticated
  using (public.is_workspace_admin(workspace_id));

create policy "Admins or self can remove membership"
  on public.workspace_members for delete
  to authenticated
  using (public.is_workspace_admin(workspace_id) or auth.uid() = user_id);

-- Trigger to automatically make workspace creator an admin member
create or replace function public.handle_new_workspace()
returns trigger as $$
begin
  if new.created_by is not null then
    insert into public.workspace_members (workspace_id, user_id, role)
    values (new.id, new.created_by, 'admin')
    on conflict do nothing;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trigger_on_workspace_created on public.workspaces;
create trigger trigger_on_workspace_created
  after insert on public.workspaces
  for each row execute function public.handle_new_workspace();



-- ------------------------------------------------------------------------------
-- 3. TEAMS & WORKFLOW STATES
-- ------------------------------------------------------------------------------
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  key text not null,
  description text,
  issue_counter integer default 0 not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (workspace_id, key)
);

create index if not exists idx_teams_workspace on public.teams(workspace_id);

alter table public.teams enable row level security;

create policy "Members can view teams in workspace"
  on public.teams for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Admins can manage teams"
  on public.teams for all
  to authenticated
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

-- Workflow States
create table if not exists public.workflow_states (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  color text not null default '#726A5C',
  position integer not null default 0,
  category text not null check (category in ('backlog', 'unstarted', 'started', 'completed', 'canceled')) default 'unstarted',
  is_default boolean default false not null,
  created_at timestamptz default now() not null
);

create index if not exists idx_workflow_states_team on public.workflow_states(team_id, position);

alter table public.workflow_states enable row level security;

create policy "Members can view workflow states"
  on public.workflow_states for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Admins or members can manage workflow states"
  on public.workflow_states for all
  to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));


-- ------------------------------------------------------------------------------
-- 4. PROJECTS
-- ------------------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  key text not null,
  description text,
  status text check (status in ('planned', 'in_progress', 'paused', 'completed', 'canceled')) default 'in_progress' not null,
  lead_id uuid references auth.users(id) on delete set null,
  target_date date,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (workspace_id, team_id, key)
);

create index if not exists idx_projects_workspace_team on public.projects(workspace_id, team_id);

alter table public.projects enable row level security;

create policy "Members can view projects"
  on public.projects for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Members can insert projects"
  on public.projects for insert
  to authenticated
  with check (public.is_workspace_member(workspace_id));

create policy "Members can update projects"
  on public.projects for update
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Admins can delete projects"
  on public.projects for delete
  to authenticated
  using (public.is_workspace_admin(workspace_id));


-- ------------------------------------------------------------------------------
-- 5. ISSUES
-- ------------------------------------------------------------------------------
create table if not exists public.issues (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  issue_number integer not null,
  identifier text not null,
  title text not null,
  description text default '' not null,
  state_id uuid not null references public.workflow_states(id) on delete restrict,
  priority text not null check (priority in ('urgent', 'high', 'medium', 'low', 'none')) default 'medium',
  assignee_id uuid references auth.users(id) on delete set null,
  reporter_id uuid references auth.users(id) on delete set null,
  due_date date,
  estimate integer,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (workspace_id, identifier)
);

create index if not exists idx_issues_workspace on public.issues(workspace_id);
create index if not exists idx_issues_team on public.issues(team_id);
create index if not exists idx_issues_project on public.issues(project_id);
create index if not exists idx_issues_assignee on public.issues(workspace_id, assignee_id);
create index if not exists idx_issues_state on public.issues(state_id);

alter table public.issues enable row level security;

create policy "Members can view issues"
  on public.issues for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Members can insert issues"
  on public.issues for insert
  to authenticated
  with check (public.is_workspace_member(workspace_id));

create policy "Members can update issues"
  on public.issues for update
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Members can delete issues"
  on public.issues for delete
  to authenticated
  using (public.is_workspace_member(workspace_id));


-- Trigger to auto-assign issue_number and identifier on insert
create or replace function public.set_issue_identifier()
returns trigger as $$
declare
  v_team_key text;
  v_num integer;
begin
  -- Lock team row and increment issue_counter atomically
  update public.teams
  set issue_counter = issue_counter + 1
  where id = new.team_id
  returning key, issue_counter into v_team_key, v_num;

  new.issue_number := v_num;
  new.identifier := v_team_key || '-' || v_num;
  return new;
end;
$$ language plpgsql security definer;

create trigger trigger_set_issue_identifier
  before insert on public.issues
  for each row
  when (new.identifier is null or new.issue_number is null)
  execute function public.set_issue_identifier();


-- ------------------------------------------------------------------------------
-- 6. TEST CASES & LINKED ISSUE TEST CASES
-- ------------------------------------------------------------------------------
create table if not exists public.test_cases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  preconditions text default '',
  steps text default '',
  expected_result text default '',
  status text check (status in ('draft', 'untested', 'passed', 'failed')) default 'untested' not null,
  priority text check (priority in ('urgent', 'high', 'medium', 'low', 'none')) default 'medium' not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists idx_test_cases_project on public.test_cases(project_id);

alter table public.test_cases enable row level security;

create policy "Members can view test cases"
  on public.test_cases for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Members can manage test cases"
  on public.test_cases for all
  to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- Issue <-> Test Case Join Table
create table if not exists public.issue_test_cases (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  issue_id uuid not null references public.issues(id) on delete cascade,
  test_case_id uuid not null references public.test_cases(id) on delete cascade,
  created_at timestamptz default now() not null,
  primary key (issue_id, test_case_id)
);

alter table public.issue_test_cases enable row level security;

create policy "Members can view and manage issue test case associations"
  on public.issue_test_cases for all
  to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));


-- ------------------------------------------------------------------------------
-- 7. COMMENTS & ACTIVITY LOGS
-- ------------------------------------------------------------------------------
create table if not exists public.issue_comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  issue_id uuid not null references public.issues(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  body text not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists idx_issue_comments_issue on public.issue_comments(issue_id, created_at);

alter table public.issue_comments enable row level security;

create policy "Members can view issue comments"
  on public.issue_comments for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Members can create issue comments"
  on public.issue_comments for insert
  to authenticated
  with check (public.is_workspace_member(workspace_id));

create policy "Authors can update their own comments"
  on public.issue_comments for update
  to authenticated
  using (public.is_workspace_member(workspace_id) and auth.uid() = author_id);

create policy "Authors or admins can delete comments"
  on public.issue_comments for delete
  to authenticated
  using (public.is_workspace_member(workspace_id) and (auth.uid() = author_id or public.is_workspace_admin(workspace_id)));

-- Activity Logs (Audit Trail)
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null check (entity_type in ('issue', 'project', 'test_case', 'comment')),
  entity_id uuid not null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  changes jsonb default '{}'::jsonb not null,
  created_at timestamptz default now() not null
);

create index if not exists idx_activity_logs_entity on public.activity_logs(entity_type, entity_id, created_at desc);

alter table public.activity_logs enable row level security;

create policy "Members can view activity logs"
  on public.activity_logs for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Members or triggers can insert activity logs"
  on public.activity_logs for insert
  to authenticated
  with check (public.is_workspace_member(workspace_id));


-- ------------------------------------------------------------------------------
-- 8. NOTIFICATIONS (In-app only)
-- ------------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  type text not null check (type in ('assignment', 'mention', 'status_change', 'comment')),
  title text not null,
  message text not null,
  entity_type text not null,
  entity_id uuid not null,
  is_read boolean default false not null,
  created_at timestamptz default now() not null
);

create index if not exists idx_notifications_recipient on public.notifications(recipient_id, is_read, created_at desc);

alter table public.notifications enable row level security;

create policy "Users can view and update their own notifications"
  on public.notifications for select
  to authenticated
  using (recipient_id = auth.uid());

create policy "Users can mark their own notifications as read"
  on public.notifications for update
  to authenticated
  using (recipient_id = auth.uid());

create policy "System/Members can insert notifications"
  on public.notifications for insert
  to authenticated
  with check (public.is_workspace_member(workspace_id));


-- ------------------------------------------------------------------------------
-- 9. HELPER PROCEDURES / DEFAULT WORKFLOW STATES SEEDER
-- ------------------------------------------------------------------------------
create or replace function public.seed_default_team_workflow_states(p_team_id uuid, p_workspace_id uuid)
returns void as $$
begin
  insert into public.workflow_states (workspace_id, team_id, name, color, position, category, is_default)
  values
    (p_workspace_id, p_team_id, 'Backlog', '#726A5C', 0, 'backlog', true),
    (p_workspace_id, p_team_id, 'Todo', '#6E8299', 1, 'unstarted', false),
    (p_workspace_id, p_team_id, 'In Progress', '#C7963E', 2, 'started', false),
    (p_workspace_id, p_team_id, 'In Review', '#B5654A', 3, 'started', false),
    (p_workspace_id, p_team_id, 'Done', '#7C8B6F', 4, 'completed', false),
    (p_workspace_id, p_team_id, 'Canceled', '#B24C3E', 5, 'canceled', false)
  on conflict do nothing;
end;
$$ language plpgsql security definer;

-- Trigger to auto-seed workflow states when a team is created
create or replace function public.handle_new_team()
returns trigger as $$
begin
  perform public.seed_default_team_workflow_states(new.id, new.workspace_id);
  return new;
end;
$$ language plpgsql security definer;

create trigger trigger_on_team_created
  after insert on public.teams
  for each row execute function public.handle_new_team();
