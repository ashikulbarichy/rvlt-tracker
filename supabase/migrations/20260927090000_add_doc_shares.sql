-- 009: share a document with selected members and teams, each as viewer or editor.
--
-- Visibility was a single enum with one team slot, so "these three people plus the
-- marketing team" could not be expressed at all. It becomes:
--
--   workspace  -- everyone in the workspace, editable by all (the wiki model, unchanged)
--   restricted -- the author, plus whoever is listed in doc_shares
--   private    -- the author alone
--
-- 'team' folds into 'restricted': one team only is just a restricted document with a
-- single team share. Two mechanisms for one idea is how they drift apart.
--
-- Each share carries can_edit, so a viewer can read and not write. That is the first
-- time the read and write predicates differ on this table, which is why the UPDATE
-- policy below no longer reuses the SELECT one.
--
-- To undo:
--   drop table if exists public.doc_shares cascade;
--   drop trigger if exists docs_guard_visibility on public.docs;
--   drop function if exists public.can_view_shared_doc(uuid);
--   drop function if exists public.can_edit_shared_doc(uuid);
--   drop function if exists public.is_doc_author(uuid);
--   -- then restore the visibility check and the policies from 20260926090000.
--
-- REQUIRES 20260926090000.

-- ---------------------------------------------------------------------------
-- 1. Composite-key targets, so doc_shares can prove its document and its team live
--    in the same workspace. Same reasoning as project_progress_types in 007.
-- ---------------------------------------------------------------------------
create unique index if not exists docs_workspace_id_id_key
  on public.docs (workspace_id, id);

create unique index if not exists teams_workspace_id_id_key
  on public.teams (workspace_id, id);

-- ---------------------------------------------------------------------------
-- 2. The share table
-- ---------------------------------------------------------------------------
create table if not exists public.doc_shares (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  doc_id uuid not null,
  -- Exactly one of these. A share is granted to a person or to a team, never both.
  user_id uuid references auth.users(id) on delete cascade,
  team_id uuid,
  can_edit boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint doc_shares_one_principal check (
    (user_id is not null and team_id is null)
    or (user_id is null and team_id is not null)
  ),

  foreign key (workspace_id, doc_id)
    references public.docs (workspace_id, id) on delete cascade,

  -- Not enforced while team_id is null (MATCH SIMPLE), which is exactly the user-share
  -- case. When it is set, it must be a team of this same workspace.
  foreign key (workspace_id, team_id)
    references public.teams (workspace_id, id) on delete cascade
);

-- One share per principal per document, so re-sharing updates rather than duplicates.
create unique index if not exists doc_shares_doc_user_key
  on public.doc_shares (doc_id, user_id) where user_id is not null;

create unique index if not exists doc_shares_doc_team_key
  on public.doc_shares (doc_id, team_id) where team_id is not null;

create index if not exists idx_doc_shares_user on public.doc_shares (user_id);
create index if not exists idx_doc_shares_team on public.doc_shares (team_id);

-- ---------------------------------------------------------------------------
-- 3. Access helpers
--
-- SECURITY DEFINER so the docs policies can consult doc_shares without doc_shares'
-- own policies being evaluated inside them -- the same pattern as is_team_member.
-- ---------------------------------------------------------------------------
create or replace function public.can_view_shared_doc(p_doc_id uuid)
returns boolean as $fn$
  select exists (
    select 1 from public.doc_shares s
     where s.doc_id = p_doc_id
       and (
         s.user_id = auth.uid()
         or (s.team_id is not null and public.is_team_member(s.team_id))
       )
  );
$fn$ language sql security definer stable;

create or replace function public.can_edit_shared_doc(p_doc_id uuid)
returns boolean as $fn$
  select exists (
    select 1 from public.doc_shares s
     where s.doc_id = p_doc_id
       and s.can_edit
       and (
         s.user_id = auth.uid()
         or (s.team_id is not null and public.is_team_member(s.team_id))
       )
  );
$fn$ language sql security definer stable;

create or replace function public.is_doc_author(p_doc_id uuid)
returns boolean as $fn$
  select exists (
    select 1 from public.docs d where d.id = p_doc_id and d.created_by = auth.uid()
  );
$fn$ language sql security definer stable;

-- ---------------------------------------------------------------------------
-- 4. Migrate 'team' documents, then widen the enum
--
-- Drop the constraint BEFORE updating the rows: the old one permits only the old
-- values, so an update to 'restricted' under it would fail outright.
-- ---------------------------------------------------------------------------
alter table public.docs drop constraint if exists docs_team_visibility_needs_team;
alter table public.docs drop constraint if exists docs_visibility_check;

insert into public.doc_shares (workspace_id, doc_id, team_id, can_edit, created_by)
select d.workspace_id, d.id, d.team_id, true, d.created_by
  from public.docs d
 where d.visibility = 'team'
   and d.team_id is not null
on conflict do nothing;

update public.docs
   set visibility = 'restricted'
 where visibility = 'team';

alter table public.docs add constraint docs_visibility_check
  check (visibility in ('workspace', 'restricted', 'private'));

-- docs.team_id is now unused by the application. Left in place rather than dropped:
-- dropping it is irreversible and an empty column costs nothing. A later migration can
-- remove it once this has run for a while.

-- ---------------------------------------------------------------------------
-- 5. Policies on docs
--
-- Read and write now differ: a viewer share grants SELECT and not UPDATE. The author
-- always has both, which also covers 'private' without a branch of its own.
-- ---------------------------------------------------------------------------
drop policy if exists "Members can view docs" on public.docs;
create policy "Members can view docs"
  on public.docs for select
  to authenticated
  using (
    public.is_workspace_member(workspace_id)
    and (
      visibility = 'workspace'
      or created_by = auth.uid()
      or (visibility = 'restricted' and public.can_view_shared_doc(id))
    )
  );

drop policy if exists "Members can update docs" on public.docs;
create policy "Members can update docs"
  on public.docs for update
  to authenticated
  using (
    public.is_workspace_member(workspace_id)
    and (
      visibility = 'workspace'
      or created_by = auth.uid()
      or public.is_workspace_admin(workspace_id)
      or (visibility = 'restricted' and public.can_edit_shared_doc(id))
    )
  )
  with check (
    public.is_workspace_member(workspace_id)
    and (
      visibility = 'workspace'
      or created_by = auth.uid()
      or public.is_workspace_admin(workspace_id)
      or (visibility = 'restricted' and public.can_edit_shared_doc(id))
    )
  );

drop policy if exists "Members can create docs" on public.docs;
create policy "Members can create docs"
  on public.docs for insert
  to authenticated
  with check (
    public.is_workspace_member(workspace_id)
    and created_by = auth.uid()
    and visibility in ('workspace', 'restricted', 'private')
  );

-- ---------------------------------------------------------------------------
-- 6. Who may change access
--
-- A trigger, not a policy. WITH CHECK sees only the finished row, so it cannot tell a
-- content edit from a visibility change -- and the permissive `visibility = 'workspace'`
-- branch that every ordinary edit relies on would also let a shared editor republish a
-- restricted document to the whole workspace. Comparing OLD to NEW is the only place
-- that distinction exists, and it gives a readable error rather than a bare RLS denial.
-- ---------------------------------------------------------------------------
create or replace function public.docs_guard_visibility_change()
returns trigger as $fn$
begin
  if new.visibility is distinct from old.visibility then
    if not (old.created_by = auth.uid() or public.is_workspace_admin(old.workspace_id)) then
      raise exception 'Only the author or a workspace admin can change who can see this document'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$fn$ language plpgsql security definer;

drop trigger if exists docs_guard_visibility on public.docs;
create trigger docs_guard_visibility
  before update on public.docs
  for each row execute function public.docs_guard_visibility_change();

-- ---------------------------------------------------------------------------
-- 7. doc_shares RLS
--
-- Read: the shares that concern you, plus all of them if you manage the document.
-- Write: the author and workspace admins only. Editing a document is not a right to
-- decide who else may see it.
-- ---------------------------------------------------------------------------
alter table public.doc_shares enable row level security;

drop policy if exists "Members can view relevant doc shares" on public.doc_shares;
create policy "Members can view relevant doc shares"
  on public.doc_shares for select
  to authenticated
  using (
    public.is_workspace_member(workspace_id)
    and (
      user_id = auth.uid()
      or (team_id is not null and public.is_team_member(team_id))
      or public.is_doc_author(doc_id)
      or public.is_workspace_admin(workspace_id)
    )
  );

drop policy if exists "Authors and admins manage doc shares" on public.doc_shares;
create policy "Authors and admins manage doc shares"
  on public.doc_shares for all
  to authenticated
  using (
    public.is_workspace_member(workspace_id)
    and (public.is_doc_author(doc_id) or public.is_workspace_admin(workspace_id))
  )
  with check (
    public.is_workspace_member(workspace_id)
    and (public.is_doc_author(doc_id) or public.is_workspace_admin(workspace_id))
  );

notify pgrst, 'reload schema';

-- Confirm: the enum is widened, no 'team' rows survive, and the policies are in place.
select visibility, count(*) as docs
  from public.docs
 where deleted_at is null
 group by visibility
 order by visibility;

select tablename, policyname, cmd,
       qual is not null       as has_using,
       with_check is not null as has_with_check
  from pg_policies
 where schemaname = 'public' and tablename in ('docs', 'doc_shares')
 order by tablename, cmd, policyname;

select count(*) as shares from public.doc_shares;
