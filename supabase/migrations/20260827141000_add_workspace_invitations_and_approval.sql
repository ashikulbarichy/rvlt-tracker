-- ==============================================================================
-- Migration: Add Workspace Invitations & Approval Flow via Dedicated Invitations
-- ==============================================================================

-- 0. Reset session role back to admin (clears 'authenticated' or 'anon' test roles)
RESET ROLE;

-- 1. Create workspace_invitations table
create table if not exists public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'member')) default 'member',
  invited_by uuid references auth.users(id) on delete set null,
  status text not null check (status in ('pending', 'accepted', 'declined')) default 'pending',
  created_at timestamptz default now() not null
);

create index if not exists idx_workspace_invitations_user on public.workspace_invitations(user_id, status);
create index if not exists idx_workspace_invitations_ws on public.workspace_invitations(workspace_id, status);

alter table public.workspace_invitations enable row level security;

-- 2. RLS Policies for workspace_invitations
drop policy if exists "Users and admins can view invitations" on public.workspace_invitations;
create policy "Users and admins can view invitations"
  on public.workspace_invitations for select
  to authenticated
  using (
    user_id = auth.uid() 
    or public.is_workspace_admin(workspace_id)
  );

drop policy if exists "Admins can create invitations" on public.workspace_invitations;
create policy "Admins can create invitations"
  on public.workspace_invitations for insert
  to authenticated
  with check (
    public.is_workspace_admin(workspace_id)
  );

drop policy if exists "Admins and users can update invitations" on public.workspace_invitations;
create policy "Admins and users can update invitations"
  on public.workspace_invitations for update
  to authenticated
  using (
    user_id = auth.uid() 
    or public.is_workspace_admin(workspace_id)
  );

drop policy if exists "Admins and users can delete invitations" on public.workspace_invitations;
create policy "Admins and users can delete invitations"
  on public.workspace_invitations for delete
  to authenticated
  using (
    user_id = auth.uid() 
    or public.is_workspace_admin(workspace_id)
  );

-- 3. Secure RPC function for an invited user to accept an invitation
create or replace function public.accept_workspace_invitation(target_workspace_id uuid)
returns void as $$
declare
  inv record;
begin
  -- Find pending invitation for the caller
  select * into inv from public.workspace_invitations
  where workspace_id = target_workspace_id 
    and user_id = auth.uid() 
    and status = 'pending'
  order by created_at desc
  limit 1;

  -- Add user into workspace_members (runs as security definer)
  insert into public.workspace_members (workspace_id, user_id, role)
  values (target_workspace_id, auth.uid(), coalesce(inv.role, 'member'))
  on conflict (workspace_id, user_id) 
  do update set role = coalesce(inv.role, public.workspace_members.role);

  -- Mark invitation accepted if found
  if inv is not null then
    update public.workspace_invitations
    set status = 'accepted'
    where id = inv.id;
  end if;
end;
$$ language plpgsql security definer set search_path = public;

-- 4. Secure RPC function for an invited user to decline an invitation
create or replace function public.decline_workspace_invitation(target_workspace_id uuid)
returns void as $$
begin
  update public.workspace_invitations
  set status = 'declined'
  where workspace_id = target_workspace_id 
    and user_id = auth.uid() 
    and status = 'pending';
end;
$$ language plpgsql security definer set search_path = public;

-- 5. Safe PL/pgSQL helper functions for workspace/team membership (avoids recursion)
create or replace function public.is_workspace_member(ws_id uuid)
returns boolean as $$
declare
  is_mem boolean;
begin
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws_id and user_id = auth.uid()
  ) into is_mem;
  return coalesce(is_mem, false);
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function public.is_workspace_admin(ws_id uuid)
returns boolean as $$
declare
  is_adm boolean;
begin
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws_id and user_id = auth.uid() and role = 'admin'
  ) into is_adm;
  return coalesce(is_adm, false);
end;
$$ language plpgsql stable security definer set search_path = public;
