-- Repair issues whose state_id points at a workflow state belonging to another team.
--
-- Cause: the kanban board deduplicated same-named columns across teams and wrote
-- `column.id` on drop, so an issue on team B dropped into "In Review" could receive
-- team A's "In Review" id. The client fix is in IssueListView's onDrop; this cleans up
-- rows already written that way.
--
-- Run the diagnostic in the accompanying chat message FIRST. If it returns no rows,
-- this migration is a harmless no-op.
--
-- Safe to re-run. Reverse is not possible (the original wrong id is not retained), but
-- nothing is deleted — only state_id is remapped to the same-named state on the issue's
-- own team.

-- Remap each mismatched issue to the same-named state on its own team.
-- Issues whose own team has no state of that name are deliberately left alone; the
-- second diagnostic query lists them for a manual decision.
update public.issues i
   set state_id = own.id
  from public.workflow_states wrong_state,
       lateral (
         select ws.id
           from public.workflow_states ws
          where ws.team_id = i.team_id
            and lower(btrim(ws.name)) = lower(btrim(wrong_state.name))
          order by ws.position
          limit 1
       ) own
 where wrong_state.id = i.state_id
   and wrong_state.team_id <> i.team_id
   and own.id is distinct from i.state_id;

-- Note on the closed_at trigger: trg_issues_sync_closed_at fires on `update of
-- state_id`. Because each issue is remapped to a state with the SAME NAME, the category
-- is expected to match too, so closed_at is preserved for completed/canceled issues and
-- stays null for open ones. Verify with the third query in chat after running this.
