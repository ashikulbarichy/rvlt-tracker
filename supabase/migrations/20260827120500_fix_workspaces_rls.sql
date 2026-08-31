-- Migration: 20260827120500_fix_workspaces_rls.sql
-- Description: Fix RLS policies on public.workspaces to allow creators to read and update workspaces, preventing 403 on INSERT ... RETURNING and unlocking admin settings.

-- 1. Update SELECT policy on workspaces to include created_by so RETURNING * succeeds on insert
drop policy if exists "Workspace members can read their workspace" on public.workspaces;
create policy "Workspace members can read their workspace"
  on public.workspaces for select
  to authenticated
  using (public.is_workspace_member(id) or auth.uid() = created_by);

-- 2. Update INSERT policy on workspaces to allow creation by authenticated users
drop policy if exists "Authenticated users can create a workspace" on public.workspaces;
create policy "Authenticated users can create a workspace"
  on public.workspaces for insert
  to authenticated
  with check (auth.uid() = created_by or created_by is null);

-- 3. Update UPDATE policy on workspaces to allow creator or workspace admin
drop policy if exists "Workspace admins can update their workspace" on public.workspaces;
create policy "Workspace admins can update their workspace"
  on public.workspaces for update
  to authenticated
  using (public.is_workspace_admin(id) or auth.uid() = created_by);

-- 4. Automatically set created_by to auth.uid() if not passed
create or replace function public.set_workspace_creator()
returns trigger as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trigger_set_workspace_creator on public.workspaces;
create trigger trigger_set_workspace_creator
  before insert on public.workspaces
  for each row execute function public.set_workspace_creator();

-- 5. Backfill existing workspaces into workspace_members for the creator
insert into public.workspace_members (workspace_id, user_id, role)
select id, created_by, 'admin'
from public.workspaces
where created_by is not null
on conflict (workspace_id, user_id) do update set role = 'admin';
