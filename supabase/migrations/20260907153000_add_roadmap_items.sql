-- ==============================================================================
-- Add roadmap_items table (unified product roadmap)
-- Planning-only tasks that live under a project. Deliberately separate from
-- public.issues: these exist purely to visualise the plan on a timeline.
-- Completion is a simple boolean (no workflow states); done items render muted.
-- Read is team-isolated (matching issues/projects/test_cases); writes are
-- restricted to workspace admins.
-- ==============================================================================

-- 0. Reset session role back to admin
RESET ROLE;

-- 1. Create roadmap_items table
-- No team_id: projects.team_id is NOT NULL, so the owning team is always
-- reachable through project_id, and the roadmap stays correct if a project is
-- ever moved between teams. Mirrors public.test_cases.
create table if not exists public.roadmap_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  start_date date,
  target_date date,
  is_completed boolean not null default false,
  completed_at timestamptz,
  position integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists idx_roadmap_items_project on public.roadmap_items(project_id, position);
create index if not exists idx_roadmap_items_workspace on public.roadmap_items(workspace_id);

-- 2. RLS
alter table public.roadmap_items enable row level security;

-- Everyone on the team can read the roadmap. Uses the same exists-join through
-- projects -> team_members as test_cases, since there is no local team_id.
drop policy if exists "Members can view roadmap items" on public.roadmap_items;
create policy "Members can view roadmap items"
  on public.roadmap_items for select
  to authenticated
  using (
    public.is_workspace_admin(workspace_id)
    or exists (
      select 1 from public.projects p
      join public.team_members tm on tm.team_id = p.team_id
      where p.id = roadmap_items.project_id and tm.user_id = auth.uid()
    )
  );

-- Only workspace admins can add, edit, complete, or delete roadmap items.
drop policy if exists "Admins can manage roadmap items" on public.roadmap_items;
create policy "Admins can manage roadmap items"
  on public.roadmap_items for all
  to authenticated
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));
