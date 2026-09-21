-- 003: collapse per-team workflow states into one set per workspace.
--
-- DESTRUCTIVE: duplicate workflow_states rows are deleted and workflow_states.team_id is
-- dropped. Issues are remapped first, so no issue loses its status, but the per-team
-- rows themselves are gone for good. Take a backup before running.

-- 1. Choose one survivor per (workspace, normalised name).
-- Not ON COMMIT DROP: the Supabase SQL editor does not guarantee one transaction for
-- the whole script, and an autocommit would drop this before step 2 could use it.
drop table if exists _status_survivors;
create temporary table _status_survivors as
select distinct on (workspace_id, lower(btrim(name)))
       id as survivor_id,
       workspace_id,
       lower(btrim(name)) as norm_name
  from public.workflow_states
 order by workspace_id, lower(btrim(name)), position, created_at, id;

-- 2. Point every issue at the survivor for its workspace and status name.
--    This also repairs the cross-team rows the kanban board wrote.
update public.issues i
   set state_id = sv.survivor_id
  from public.workflow_states old_s
  join _status_survivors sv
    on sv.workspace_id = old_s.workspace_id
   and sv.norm_name = lower(btrim(old_s.name))
 where old_s.id = i.state_id
   and sv.survivor_id <> i.state_id;

-- 4. Delete the now-unreferenced duplicates.
delete from public.workflow_states ws
 where not exists (
   select 1 from _status_survivors sv where sv.survivor_id = ws.id
 );

-- 5. Drop the team-scoped policy before the column it reads.
drop policy if exists "Members can view workflow states" on public.workflow_states;
drop policy if exists "Admins or members can manage workflow states" on public.workflow_states;

-- 6. Drop the column.
alter table public.workflow_states drop column if exists team_id;

-- 7. Workspace-scoped policies.
create policy "Members can view workflow states"
  on public.workflow_states for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

-- Everyone reads; only admins change colours or names. RLS is permissive, so the
-- select policy above still applies to non-admin members.
create policy "Admins can manage workflow states"
  on public.workflow_states for all
  to authenticated
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

-- 8. Stop duplicates coming back.
create unique index if not exists idx_workflow_states_ws_name
  on public.workflow_states (workspace_id, lower(btrim(name)));

-- 8b. Pin the unified palette (Development's, per the inventory review). Explicit rather
--     than relying on which duplicate row survived: positions tied at 0-5 across both
--     teams, so the survivor's colour would otherwise be decided by created_at order.
--     Applies to every workspace that uses these names, which is the point of unifying.
update public.workflow_states ws
   set color = v.color
  from (values
    ('backlog',     '#535353'),
    ('todo',        '#D48C45'),
    ('in progress', '#1ED760'),
    ('in review',   '#4A7BB5'),
    ('done',        '#B37FEB'),
    ('canceled',    '#B55151')
  ) as v(norm_name, color)
 where lower(btrim(ws.name)) = v.norm_name
   and ws.color is distinct from v.color;

-- 9. Renumber positions 0..n-1 per workspace so ordering is contiguous.
with ordered as (
  select id, row_number() over (partition by workspace_id order by position, name) - 1 as new_pos
    from public.workflow_states
)
update public.workflow_states ws
   set position = ordered.new_pos
  from ordered
 where ordered.id = ws.id
   and ws.position is distinct from ordered.new_pos;

-- 10. New teams must no longer seed statuses; new workspaces must.
drop trigger if exists trigger_on_team_created on public.teams;
drop function if exists public.handle_new_team();
drop function if exists public.seed_default_team_workflow_states(uuid, uuid);

create or replace function public.seed_default_workspace_workflow_states(p_workspace_id uuid)
returns void as $$
begin
  insert into public.workflow_states (workspace_id, name, color, position, category, is_default)
  values
    -- Same palette step 8b pins, so a new workspace matches the existing one.
    (p_workspace_id, 'Backlog',     '#535353', 0, 'backlog',   true),
    (p_workspace_id, 'Todo',        '#D48C45', 1, 'unstarted', false),
    (p_workspace_id, 'In Progress', '#1ED760', 2, 'started',   false),
    (p_workspace_id, 'In Review',   '#4A7BB5', 3, 'started',   false),
    (p_workspace_id, 'Done',        '#B37FEB', 4, 'completed', false),
    (p_workspace_id, 'Canceled',    '#B55151', 5, 'canceled',  false)
  on conflict do nothing;
end;
$$ language plpgsql security definer;

create or replace function public.handle_new_workspace()
returns trigger as $$
begin
  if new.created_by is not null then
    insert into public.workspace_members (workspace_id, user_id, role)
    values (new.id, new.created_by, 'admin')
    on conflict do nothing;
  end if;
  perform public.seed_default_workspace_workflow_states(new.id);
  return new;
end;
$$ language plpgsql security definer;

-- 11. Any existing workspace with no statuses at all gets the defaults.
do $$
declare w record;
begin
  for w in select id from public.workspaces loop
    if not exists (select 1 from public.workflow_states where workspace_id = w.id) then
      perform public.seed_default_workspace_workflow_states(w.id);
    end if;
  end loop;
end $$;

drop table if exists _status_survivors;
