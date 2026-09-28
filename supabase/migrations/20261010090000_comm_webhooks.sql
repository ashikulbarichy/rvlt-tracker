-- Reevolt Tasks → comm notifications (approved 2026-09-28). Sends events to comm's tracker-hook function.
--
-- Sends a small JSON event to comm's `tracker-hook` edge function when something a person would
-- want to hear about happens. Filtered in the trigger WHEN clauses so drag-to-reorder, rank or
-- description edits send nothing (keeps comm's function invocations low).
--   • ticket created                         → channels following the project
--   • status / title / priority / due change → assignees + reporter, followers, card refresh
--   • someone assigned                       → that person
--   • comment added                          → assignees + reporter (not the author)
--   • @mention in a comment (notifications)  → the mentioned person, if not already covered above
--
-- One-time setup after running (SQL editor, tracker project):
--   select vault.create_secret('https://<comm-ref>.supabase.co/functions/v1/tracker-hook', 'comm_hook_url');
--   select vault.create_secret('<long random string, same as comm TRACKER_HOOK_SECRET>', 'comm_hook_secret');

create extension if not exists pg_net;

create or replace function public.comm_ticket_payload(t public.tickets) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', t.id, 'identifier', t.identifier, 'title', t.title, 'priority', t.priority, 'due_date', t.due_date,
    'workspace', (select slug from workspaces w where w.id = t.workspace_id),
    'project_id', t.project_id,
    'project', (select name from projects p where p.id = t.project_id),
    'state', (select jsonb_build_object('name', s.name, 'color', s.color, 'category', s.category) from workflow_states s where s.id = t.state_id),
    'reporter_id', t.reporter_id,
    'assignee_ids', coalesce((select jsonb_agg(a.user_id) from ticket_assignees a where a.ticket_id = t.id), '[]'::jsonb),
    'deleted', t.deleted_at is not null
  );
$$;

create or replace function public.comm_send(ev jsonb) returns void
language plpgsql security definer set search_path = public, vault as $$
declare
  hook_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'comm_hook_url');
  hook_key text := (select decrypted_secret from vault.decrypted_secrets where name = 'comm_hook_secret');
begin
  if hook_url is null or hook_key is null then return; end if; -- not configured: do nothing
  perform net.http_post(
    url := hook_url,
    body := ev || jsonb_build_object(
      'actor_id', auth.uid(),
      'actor_name', (select coalesce(nullif(full_name, ''), split_part(email, '@', 1)) from profiles where id = auth.uid()),
      'at', now()),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', hook_key),
    timeout_milliseconds := 3000
  );
exception when others then
  -- Never block the tracker because comm is unreachable.
  raise warning 'comm_send failed: %', sqlerrm;
end $$;

-- tickets: created / meaningful change
create or replace function public.comm_on_ticket() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform comm_send(jsonb_build_object('event', 'ticket_created', 'ticket', comm_ticket_payload(new)));
  else
    perform comm_send(jsonb_build_object('event', 'ticket_updated', 'ticket', comm_ticket_payload(new),
      'changes', jsonb_strip_nulls(jsonb_build_object(
        'state', case when old.state_id is distinct from new.state_id then
          (select name from workflow_states s where s.id = old.state_id) end,
        'title', case when old.title is distinct from new.title then old.title end,
        'priority', case when old.priority is distinct from new.priority then old.priority end,
        'due_date', case when old.due_date is distinct from new.due_date then coalesce(old.due_date::text, '') end,
        'deleted', case when old.deleted_at is distinct from new.deleted_at then true end))));
  end if;
  return null;
end $$;

drop trigger if exists comm_ticket_insert on public.tickets;
create trigger comm_ticket_insert after insert on public.tickets
  for each row execute function public.comm_on_ticket();

drop trigger if exists comm_ticket_update on public.tickets;
create trigger comm_ticket_update after update on public.tickets
  for each row when (
    old.state_id is distinct from new.state_id or old.title is distinct from new.title
    or old.priority is distinct from new.priority or old.due_date is distinct from new.due_date
    or old.deleted_at is distinct from new.deleted_at)
  execute function public.comm_on_ticket();

-- assignments
create or replace function public.comm_on_assignee() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform comm_send(jsonb_build_object('event', 'assigned', 'user_id', new.user_id,
    'ticket', (select comm_ticket_payload(t) from tickets t where t.id = new.ticket_id)));
  return null;
end $$;
drop trigger if exists comm_assignee_insert on public.ticket_assignees;
create trigger comm_assignee_insert after insert on public.ticket_assignees
  for each row execute function public.comm_on_assignee();

-- comments
create or replace function public.comm_on_comment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform comm_send(jsonb_build_object('event', 'commented', 'author_id', new.author_id, 'excerpt', left(new.body, 280),
    'ticket', (select comm_ticket_payload(t) from tickets t where t.id = new.ticket_id)));
  return null;
end $$;
drop trigger if exists comm_comment_insert on public.ticket_comments;
create trigger comm_comment_insert after insert on public.ticket_comments
  for each row execute function public.comm_on_comment();

-- @mentions (the tracker writes these into notifications); skip people the comment already reaches
create or replace function public.comm_on_mention() returns trigger
language plpgsql security definer set search_path = public as $$
declare t public.tickets;
begin
  select * into t from tickets where id = new.entity_id;
  if t.id is null then return null; end if;
  if new.recipient_id = t.reporter_id or exists (select 1 from ticket_assignees a where a.ticket_id = t.id and a.user_id = new.recipient_id) then
    return null;
  end if;
  perform comm_send(jsonb_build_object('event', 'mentioned', 'user_id', new.recipient_id, 'ticket', comm_ticket_payload(t)));
  return null;
end $$;
drop trigger if exists comm_mention_insert on public.notifications;
create trigger comm_mention_insert after insert on public.notifications
  for each row when (new.type = 'mention' and new.entity_type = 'ticket')
  execute function public.comm_on_mention();

revoke all on function public.comm_send(jsonb) from public, anon, authenticated;
revoke all on function public.comm_ticket_payload(public.tickets) from public, anon, authenticated;
