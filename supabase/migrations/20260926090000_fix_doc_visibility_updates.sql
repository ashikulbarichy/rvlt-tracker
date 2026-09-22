-- 008: make a document's visibility actually changeable.
--
-- THE BUG. The UPDATE policy added by 20260923090000 has a USING clause and no
-- WITH CHECK. Postgres then applies USING to the NEW row as well, so a predicate meant
-- to decide *which documents you may edit* also dictated *what they were allowed to
-- become*:
--
--   * workspace -> team was rejected outright. The new row had to satisfy
--     `team_id is not null and is_team_member(team_id)`, and the client sends a null
--     team on the switch, so "One team only" could never be saved by anyone.
--   * even with a team chosen, you had to already be a member of the target team, so an
--     admin could not hand a document to a team they are not in.
--   * workspace -> private was rejected for anyone who was not the author, because the
--     new row had to satisfy `created_by = auth.uid()`.
--
-- THE FIX. Give UPDATE an explicit WITH CHECK, so the two questions are answered
-- separately: USING keeps the read predicate (which documents you may touch), WITH CHECK
-- says what a document may become.
--
-- The one restriction kept in WITH CHECK is that only the author may set 'private' --
-- otherwise any member could take a shared document away from everyone else. Moving a
-- document to a team you are not in IS allowed: that team can still read it, so nothing
-- is lost, and forbidding it is what broke the admin case.
--
-- To undo, re-run the policy block from 20260923090000 and:
--   alter table public.docs drop constraint if exists docs_team_visibility_needs_team;
--
-- REQUIRES 20260923090000.

-- ---------------------------------------------------------------------------
-- 1. Repair, then forbid, the unreachable state
--
-- visibility = 'team' with team_id = null satisfies NO branch of the read policy, so
-- such a row is invisible to everyone including its author. The INSERT policy never
-- checked visibility, so one could be created directly even though the UI does not.
-- Returned to the author as private, which is the only repair that gives someone the
-- access needed to fix it properly.
-- ---------------------------------------------------------------------------
update public.docs
   set visibility = 'private'
 where visibility = 'team'
   and team_id is null;

alter table public.docs drop constraint if exists docs_team_visibility_needs_team;
alter table public.docs add constraint docs_team_visibility_needs_team
  check (visibility <> 'team' or team_id is not null);

-- ---------------------------------------------------------------------------
-- 2. UPDATE: USING for which rows, WITH CHECK for what they may become
-- ---------------------------------------------------------------------------
drop policy if exists "Members can update docs" on public.docs;
create policy "Members can update docs"
  on public.docs for update
  to authenticated
  using (
    public.is_workspace_member(workspace_id)
    and (
      visibility = 'workspace'
      or (visibility = 'team' and team_id is not null and public.is_team_member(team_id))
      or (visibility = 'private' and created_by = auth.uid())
    )
  )
  with check (
    public.is_workspace_member(workspace_id)
    and (
      visibility = 'workspace'
      or (visibility = 'team' and team_id is not null)
      or (visibility = 'private' and created_by = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 3. INSERT: the same shape rule, so a document cannot be born unreachable
-- ---------------------------------------------------------------------------
drop policy if exists "Members can create docs" on public.docs;
create policy "Members can create docs"
  on public.docs for insert
  to authenticated
  with check (
    public.is_workspace_member(workspace_id)
    and created_by = auth.uid()
    and (
      visibility = 'workspace'
      or (visibility = 'team' and team_id is not null)
      or visibility = 'private'
    )
  );

notify pgrst, 'reload schema';

-- Confirm: both write policies now carry a WITH CHECK, and no document is stranded.
select policyname,
       cmd,
       qual is not null       as has_using,
       with_check is not null as has_with_check
  from pg_policies
 where schemaname = 'public' and tablename = 'docs'
 order by cmd, policyname;

select count(*) filter (where visibility = 'team'  and team_id is null) as stranded_team_docs,
       count(*) filter (where visibility = 'team')                      as team_docs,
       count(*) filter (where visibility = 'private')                   as private_docs,
       count(*) filter (where visibility = 'workspace')                 as workspace_docs
  from public.docs
 where deleted_at is null;
