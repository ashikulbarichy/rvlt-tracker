-- 006: a content-marketing script template.
--
-- Kept in its own seed function rather than folded into seed_default_doc_templates, so
-- the twelve original templates are not restated (and risk being mistyped) every time a
-- new one is added. More marketing templates belong in this function.
--
-- REQUIRES migration 20260923090000 (docs and templates).
--
-- Safe to re-run: the insert is `on conflict do nothing` against the
-- (workspace_id, lower(btrim(name))) unique index.

create or replace function public.seed_marketing_doc_templates(p_workspace_id uuid)
returns void as $fn$
begin
  insert into public.doc_templates (workspace_id, name, description, category, icon, content, is_builtin, position)
  values
  (p_workspace_id, 'Video Script',
   'Hook, spoken script and shot list for a marketing video. Spoken lines are set in a typewriter face.',
   'Go-to-market', 'clapperboard',
$html$<h2>Brief</h2>
<p><em>Platform, length, audience, and the one thing this video has to achieve. Write the goal as a viewer action, not a feeling.</em></p>
<p></p>

<h2>Hook — first 3 seconds</h2>
<p><em>If the hook fails, nothing below it gets watched. Write three and pick one.</em></p>
<div data-type="script"><p></p></div>

<h2>Script</h2>
<p><em>Only what is actually said. Read it aloud and time it: roughly 150 words per minute.</em></p>
<div data-type="script"><p></p></div>

<h2>Shot list</h2>
<table><tbody>
<tr><th><p>Visual</p></th><th><p>Voiceover</p></th><th><p>On-screen text</p></th></tr>
<tr><td><p></p></td><td><p></p></td><td><p></p></td></tr>
<tr><td><p></p></td><td><p></p></td><td><p></p></td></tr>
<tr><td><p></p></td><td><p></p></td><td><p></p></td></tr>
</tbody></table>

<h2>Call to action</h2>
<p><em>One action. Two is none.</em></p>
<div data-type="script"><p></p></div>

<h2>Before publishing</h2>
<ul data-type="taskList">
<li data-type="taskItem" data-checked="false"><p>Hook works with the sound off</p></li>
<li data-type="taskItem" data-checked="false"><p>Captions burned in</p></li>
<li data-type="taskItem" data-checked="false"><p>Aspect ratio matches the platform</p></li>
<li data-type="taskItem" data-checked="false"><p>Claims checked</p></li>
</ul>$html$, true, 12)
  on conflict do nothing;
end;
$fn$ language plpgsql security definer;

-- handle_new_workspace was last rewritten by 20260923090000. This carries all four
-- prior calls plus the new one.
create or replace function public.handle_new_workspace()
returns trigger as $fn$
begin
  if new.created_by is not null then
    insert into public.workspace_members (workspace_id, user_id, role)
    values (new.id, new.created_by, 'admin')
    on conflict do nothing;
  end if;
  perform public.seed_default_workspace_workflow_states(new.id);
  perform public.seed_default_ticket_types(new.id);
  perform public.seed_default_doc_collections(new.id);
  perform public.seed_default_doc_templates(new.id);
  perform public.seed_marketing_doc_templates(new.id);
  return new;
end;
$fn$ language plpgsql security definer;

-- Backfill every existing workspace.
do $$
declare w record;
begin
  for w in select id from public.workspaces loop
    perform public.seed_marketing_doc_templates(w.id);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- Confirm: one 'Video Script' per workspace, alongside the twelve originals.
select w.name as workspace,
       count(t.id) as templates,
       count(*) filter (where t.name = 'Video Script') as video_script
  from public.workspaces w
  left join public.doc_templates t on t.workspace_id = w.id
 group by w.name
 order by w.name;
