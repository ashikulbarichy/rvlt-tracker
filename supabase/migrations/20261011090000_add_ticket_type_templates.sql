-- 019: description templates per ticket type.
--
-- ticket_types.description_template: HTML the New ticket panel puts in an empty
-- description when this type is picked. Empty means no template. Admins edit it under the
-- existing "Admins can manage ticket types" policy; nothing else changes.
--
-- Starting values: a user story ("As a / I want / So that") for every type that takes
-- story points (Feature, Improvement, Documentation, and anything else estimated), and a
-- reproduce template for Bug. Only rows still empty are filled, so re-running this never
-- overwrites a template someone has edited.
--
-- To undo:
--   alter table public.ticket_types drop column if exists description_template;
--   and re-run seed_default_ticket_types from 20261002090000.

alter table public.ticket_types
  add column if not exists description_template text not null default '';

update public.ticket_types
   set description_template =
     '<p><strong>As a</strong> [type of user]</p><p><strong>I want</strong> [some goal]</p><p><strong>So that</strong> [the reason it matters]</p>'
 where description_template = ''
   and takes_story_points;

update public.ticket_types
   set description_template =
     '<p><strong>Steps to reproduce</strong></p><ol><li></li></ol><p><strong>Expected</strong></p><p></p><p><strong>Actual</strong></p><p></p>'
 where description_template = ''
   and lower(btrim(name)) = 'bug';

-- New workspaces start with the same templates.
create or replace function public.seed_default_ticket_types(p_workspace_id uuid)
returns void as $$
declare
  v_story text := '<p><strong>As a</strong> [type of user]</p><p><strong>I want</strong> [some goal]</p><p><strong>So that</strong> [the reason it matters]</p>';
  v_bug   text := '<p><strong>Steps to reproduce</strong></p><ol><li></li></ol><p><strong>Expected</strong></p><p></p><p><strong>Actual</strong></p><p></p>';
begin
  insert into public.ticket_types
    (workspace_id, name, color, position, counts_toward_progress, is_default, takes_story_points, description_template)
  values
    (p_workspace_id, 'Bug',         '#B55151', 0, false, false, false, v_bug),
    (p_workspace_id, 'Feature',     '#1ED760', 1, true,  true,  true,  v_story),
    (p_workspace_id, 'Improvement', '#4A7BB5', 2, false, false, true,  v_story)
  on conflict do nothing;
end;
$$ language plpgsql security definer;

notify pgrst, 'reload schema';

-- Confirm: each type and whether it now has a template.
select name, takes_story_points, description_template <> '' as has_template
  from public.ticket_types
 order by workspace_id, position;
