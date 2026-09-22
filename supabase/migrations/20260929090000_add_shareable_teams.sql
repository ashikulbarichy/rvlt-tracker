-- 011: let a document's author share it with any team, not only their own.
--
-- doc_shares already ALLOWS this -- its write policy asks only that you are the author
-- or an admin, and a foreign key check is not subject to RLS. What blocked it was
-- reading: the teams SELECT policy from 20260827135500 shows a non-admin only the teams
-- they belong to, so the share picker had nothing else to offer.
--
-- The teams policy is NOT widened. Team isolation is the entire point of that migration,
-- and relaxing it would change the sidebar, ticket creation, project scoping and every
-- team picker in the app. This adds one narrow read path instead.
--
-- What it discloses, deliberately: every workspace member can now learn the NAMES of all
-- teams in their workspace, through this function only. It exposes no tickets, projects,
-- documents or membership -- and the workspace's own member list is already readable, so
-- this is a smaller disclosure than it first appears. If even that is unwanted, drop the
-- function and the picker falls back to the caller's own teams.
--
-- To undo:
--   drop function if exists public.shareable_teams(uuid);
--
-- REQUIRES 20260827135500.

-- SECURITY DEFINER bypasses RLS, so the function has to do its own authorization. The
-- is_workspace_member check is what stands in for the policy it is stepping around:
-- a caller outside the workspace gets zero rows, not an error.
create or replace function public.shareable_teams(p_workspace_id uuid)
returns setof public.teams as $fn$
  select t.*
    from public.teams t
   where t.workspace_id = p_workspace_id
     and public.is_workspace_member(p_workspace_id)
   order by t.name;
$fn$ language sql security definer stable;

-- Not reachable by anon. The default grant on a new function is to PUBLIC, which in
-- Supabase includes the anonymous role.
revoke all on function public.shareable_teams(uuid) from public;
grant execute on function public.shareable_teams(uuid) to authenticated;

notify pgrst, 'reload schema';

-- Confirm: the function exists, is SECURITY DEFINER, returns teams, and only
-- authenticated may call it.
select p.proname,
       p.prosecdef as security_definer,
       pg_get_function_result(p.oid) as returns,
       array(
         select a.grantee
           from information_schema.routine_privileges a
          where a.specific_schema = 'public'
            and a.routine_name = 'shareable_teams'
            and a.privilege_type = 'EXECUTE'
       ) as can_execute
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname = 'shareable_teams';

-- And what it will return for this workspace's members.
select w.name as workspace, count(t.id) as teams
  from public.workspaces w
  left join public.teams t on t.workspace_id = w.id
 group by w.name
 order by w.name;
