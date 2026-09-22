-- 007: per-project choice of which ticket types count toward progress.
--
-- Until now progress was one workspace-wide flag (ticket_types.counts_toward_progress,
-- added by 20260922092000). That is wrong for a workspace running more than one kind of
-- work: a content-marketing project is delivered by finishing Documentation tickets, a
-- development project by finishing Features. One flag cannot say both.
--
-- This adds an OVERRIDE, not a replacement:
--
--   * a project with NO rows here inherits the workspace flag, exactly as today;
--   * a project with rows here counts only those types.
--
-- Keeping the workspace flag as the fallback means existing projects do not change
-- behaviour, and a new type flagged at workspace level still reaches every project that
-- has not opted out.
--
-- To undo:
--   drop table if exists public.project_progress_types;
--
-- REQUIRES 20260922092000 (ticket types).

-- ---------------------------------------------------------------------------
-- 1. Composite-key targets
--
-- So the join table can carry workspace_id and have the FKs prove that the project and
-- the type live in the SAME workspace. Without this a row could pair a project with
-- another workspace's type -- the same class of bug 003 had to repair for statuses.
-- These are redundant as uniqueness (both ids are already primary keys); they exist only
-- to be referenceable.
-- ---------------------------------------------------------------------------
create unique index if not exists projects_workspace_id_id_key
  on public.projects (workspace_id, id);

create unique index if not exists ticket_types_workspace_id_id_key
  on public.ticket_types (workspace_id, id);

-- ---------------------------------------------------------------------------
-- 2. Table
-- ---------------------------------------------------------------------------
create table if not exists public.project_progress_types (
  workspace_id uuid not null,
  project_id   uuid not null,
  type_id      uuid not null,
  created_at   timestamptz not null default now(),

  primary key (project_id, type_id),

  foreign key (workspace_id, project_id)
    references public.projects (workspace_id, id) on delete cascade,

  -- cascade, not restrict: tickets.type_id already blocks deleting a type that is in
  -- use. A second blocker here would mean an unused type could not be deleted merely
  -- because some project still listed it.
  foreign key (workspace_id, type_id)
    references public.ticket_types (workspace_id, id) on delete cascade
);

-- The primary key covers project_id lookups; this covers the type_id side, which the
-- FK cascade walks on every type delete.
create index if not exists idx_project_progress_types_type
  on public.project_progress_types (workspace_id, type_id);

-- ---------------------------------------------------------------------------
-- 3. RLS
--
-- One policy rather than the usual view/manage pair: the predicate is identical for
-- both. Anyone who may edit the project may set what counts as progress on it, so this
-- is the projects UPDATE predicate from 20260827135500, reached through the project.
-- ---------------------------------------------------------------------------
alter table public.project_progress_types enable row level security;

drop policy if exists "Project editors manage progress types" on public.project_progress_types;
create policy "Project editors manage progress types"
  on public.project_progress_types for all
  to authenticated
  using (
    exists (
      select 1 from public.projects p
       where p.id = project_progress_types.project_id
         and (
           public.is_workspace_admin(p.workspace_id)
           or (public.is_workspace_member(p.workspace_id) and public.is_team_member(p.team_id))
         )
    )
  )
  with check (
    exists (
      select 1 from public.projects p
       where p.id = project_progress_types.project_id
         and (
           public.is_workspace_admin(p.workspace_id)
           or (public.is_workspace_member(p.workspace_id) and public.is_team_member(p.team_id))
         )
    )
  );

-- No backfill. Empty means "inherit the workspace flag", so every existing project keeps
-- the progress number it shows today.

notify pgrst, 'reload schema';

-- Confirm: the table exists and every project still inherits.
select p.name as project,
       coalesce(
         string_agg(tt.name, ', ' order by tt.position),
         '(inherits workspace defaults)'
       ) as counts_toward_progress
  from public.projects p
  left join public.project_progress_types ppt on ppt.project_id = p.id
  left join public.ticket_types tt on tt.id = ppt.type_id
 group by p.name
 order by p.name;
