-- Migration: 20260827122000_add_workspace_member_notification_trigger.sql
-- Description: Automatically notify users when they are added to a workspace.

create or replace function public.notify_new_workspace_member()
returns trigger as $$
declare
  ws_name text;
  inviter_name text;
begin
  -- Only notify if user did not add themselves (e.g. workspace creation)
  if auth.uid() is not null and auth.uid() <> new.user_id then
    select name into ws_name from public.workspaces where id = new.workspace_id;
    select coalesce(full_name, email, 'An admin') into inviter_name from public.profiles where id = auth.uid();
    
    insert into public.notifications (
      workspace_id,
      recipient_id,
      actor_id,
      type,
      title,
      message,
      entity_type,
      entity_id,
      is_read
    ) values (
      new.workspace_id,
      new.user_id,
      auth.uid(),
      'mention',
      'Workspace Invitation',
      coalesce(inviter_name, 'An admin') || ' added you to workspace "' || coalesce(ws_name, 'Workspace') || '"',
      'workspace',
      new.workspace_id,
      false
    );
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trigger_notify_new_workspace_member on public.workspace_members;
create trigger trigger_notify_new_workspace_member
  after insert on public.workspace_members
  for each row execute function public.notify_new_workspace_member();
