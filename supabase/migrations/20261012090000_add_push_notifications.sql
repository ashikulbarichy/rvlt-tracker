-- 020: push notifications (urgent, due within 24h, assigned).
--
-- Every push is also an in-app notification: the database creates the notification row,
-- and a trigger on notifications asks the `send-push` Edge Function to deliver it to the
-- recipient's devices. Only the notification's id leaves the database; the function
-- reads the rest with the service role and sends a short title and body.
--
-- What creates notifications here (all in the database, so no screen can skip them):
--   * assigned        ticket_assignees insert -> the person assigned (not if they did it)
--   * urgent          a ticket's priority becomes urgent -> its assignees, or the
--                     reporter when nobody is assigned; never the person who changed it
--   * due within 24h  hourly pg_cron job -> same recipients, once per due date
--
-- "Due within 24h": due_date is a date with no time, so a ticket counts as due at the end
-- of that day (midnight UTC). The hourly job sends once that moment is under 24h away.
--
-- One-time setup after running (SQL editor), like comm's hook:
--   select vault.create_secret('https://<this-project-ref>.supabase.co/functions/v1/send-push', 'push_function_url');
--   select vault.create_secret('<long random string, same as the function''s PUSH_HOOK_SECRET>', 'push_hook_secret');
-- Until both exist, notifications are still created; pushes are simply not sent.
--
-- To undo:
--   select cron.unschedule('push-due-soon');
--   drop trigger if exists push_on_notification on public.notifications;
--   drop trigger if exists notify_on_assignee on public.ticket_assignees;
--   drop trigger if exists notify_on_urgent on public.tickets;
--   drop function if exists public.push_on_notification();
--   drop function if exists public.notify_on_assignee();
--   drop function if exists public.notify_on_urgent();
--   drop function if exists public.notify_due_soon();
--   drop function if exists public.notify_ticket_people(public.tickets, text, text, text);
--   drop table if exists public.push_subscriptions;
--   alter table public.tickets drop column if exists due_reminded_for;
--   and restore the notifications type check from 20260827073128.

create extension if not exists pg_net;
create extension if not exists pg_cron with schema pg_catalog;

-- ---------------------------------------------------------------------------
-- 1. Notification types. Adds urgent and due_soon, and the invite types the app
--    already tries to write (which the old check refused).
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('assignment', 'mention', 'status_change', 'comment',
                  'workspace_invite', 'workspace_invitation', 'urgent', 'due_soon'));

-- ---------------------------------------------------------------------------
-- 2. Push subscriptions: one row per browser/device a person turned push on in.
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists idx_push_subscriptions_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Users see their own push subscriptions" on public.push_subscriptions;
create policy "Users see their own push subscriptions"
  on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users add their own push subscriptions" on public.push_subscriptions;
create policy "Users add their own push subscriptions"
  on public.push_subscriptions for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users update their own push subscriptions" on public.push_subscriptions;
create policy "Users update their own push subscriptions"
  on public.push_subscriptions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Users remove their own push subscriptions" on public.push_subscriptions;
create policy "Users remove their own push subscriptions"
  on public.push_subscriptions for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. Who hears about a ticket: its assignees, or the reporter when there are none;
--    never the person making the change (auth.uid(), null for the scheduled job).
-- ---------------------------------------------------------------------------
create or replace function public.notify_ticket_people(t public.tickets, p_type text, p_title text, p_message text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  with recipients as (
    select a.user_id as id from public.ticket_assignees a where a.ticket_id = t.id
    union
    select t.reporter_id
     where t.reporter_id is not null
       and not exists (select 1 from public.ticket_assignees a where a.ticket_id = t.id)
  )
  insert into public.notifications (workspace_id, recipient_id, actor_id, type, title, message, entity_type, entity_id)
  select t.workspace_id, r.id, auth.uid(), p_type, p_title, p_message, 'ticket', t.id
    from recipients r
   where r.id is distinct from auth.uid();
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Assigned. The app used to write this notification itself on ticket creation;
--    it now leaves it to this trigger, and it saves assignee changes as a diff so
--    re-saving a ticket does not re-notify everyone already on it.
-- ---------------------------------------------------------------------------
create or replace function public.notify_on_assignee()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  t public.tickets;
begin
  if new.user_id is not distinct from auth.uid() then return null; end if;
  select * into t from public.tickets where id = new.ticket_id;
  if t.id is null or t.deleted_at is not null then return null; end if;
  insert into public.notifications (workspace_id, recipient_id, actor_id, type, title, message, entity_type, entity_id)
  values (t.workspace_id, new.user_id, auth.uid(), 'assignment',
          case when t.priority = 'urgent' then 'Urgent ticket assigned to you' else 'Assigned to you' end,
          t.identifier || ' · ' || t.title,
          'ticket', t.id);
  return null;
end $$;

drop trigger if exists notify_on_assignee on public.ticket_assignees;
create trigger notify_on_assignee
  after insert on public.ticket_assignees
  for each row execute function public.notify_on_assignee();

-- ---------------------------------------------------------------------------
-- 5. Urgent: the moment a ticket's priority becomes urgent.
-- ---------------------------------------------------------------------------
create or replace function public.notify_on_urgent()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is null then
    perform public.notify_ticket_people(new, 'urgent', 'Marked urgent', new.identifier || ' · ' || new.title);
  end if;
  return null;
end $$;

drop trigger if exists notify_on_urgent on public.tickets;
create trigger notify_on_urgent
  after update of priority on public.tickets
  for each row
  when (new.priority = 'urgent' and old.priority is distinct from 'urgent')
  execute function public.notify_on_urgent();

-- ---------------------------------------------------------------------------
-- 6. Due within 24h, hourly. due_reminded_for makes it once per due date: moving
--    the due date re-arms it.
-- ---------------------------------------------------------------------------
alter table public.tickets add column if not exists due_reminded_for date;

create or replace function public.notify_due_soon()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  t public.tickets;
  v_sent integer := 0;
begin
  for t in
    select tk.*
      from public.tickets tk
      join public.workflow_states ws on ws.id = tk.state_id
     where tk.due_date is not null
       and tk.deleted_at is null
       and ws.category not in ('completed', 'canceled')
       and tk.due_reminded_for is distinct from tk.due_date
       and ((tk.due_date + 1)::timestamp at time zone 'UTC') > now()
       and ((tk.due_date + 1)::timestamp at time zone 'UTC') <= now() + interval '24 hours'
     for update of tk skip locked
  loop
    v_sent := v_sent + public.notify_ticket_people(t, 'due_soon', 'Due within 24 hours',
                                                   t.identifier || ' · ' || t.title);
    update public.tickets set due_reminded_for = t.due_date where id = t.id;
  end loop;
  return v_sent;
end $$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'push-due-soon') then
    perform cron.unschedule('push-due-soon');
  end if;
end $$;
select cron.schedule('push-due-soon', '0 * * * *', 'select public.notify_due_soon()');

-- ---------------------------------------------------------------------------
-- 7. Deliver: every new notification asks send-push to push it. Never blocks the
--    insert; unconfigured or unreachable means no push, nothing else.
-- ---------------------------------------------------------------------------
create or replace function public.push_on_notification()
returns trigger
language plpgsql security definer set search_path = public, vault as $$
declare
  v_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'push_function_url');
  v_key text := (select decrypted_secret from vault.decrypted_secrets where name = 'push_hook_secret');
begin
  if v_url is null or v_key is null then return null; end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('notification_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_key),
    timeout_milliseconds := 5000
  );
  return null;
exception when others then
  raise warning 'push_on_notification failed: %', sqlerrm;
  return null;
end $$;

drop trigger if exists push_on_notification on public.notifications;
create trigger push_on_notification
  after insert on public.notifications
  for each row execute function public.push_on_notification();

revoke all on function public.notify_ticket_people(public.tickets, text, text, text) from public, anon, authenticated;
revoke all on function public.notify_due_soon() from public, anon, authenticated;
revoke all on function public.push_on_notification() from public, anon, authenticated;

notify pgrst, 'reload schema';

-- Confirm, as one row. Expected: 1 | 4 | 1 | 3 | 1
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'push_subscriptions')                     as subs_table,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'push_subscriptions')                        as subs_policies,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'tickets' and column_name = 'due_reminded_for') as reminder_col,
  (select count(*) from pg_trigger
    where tgname in ('notify_on_assignee', 'notify_on_urgent', 'push_on_notification')
      and not tgisinternal)                                                                   as triggers,
  (select count(*) from cron.job where jobname = 'push-due-soon')                             as cron_job;
