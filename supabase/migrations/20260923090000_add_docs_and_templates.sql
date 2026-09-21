-- 005: Docs — a nested wiki with collections and templates.
--
-- REQUIRES migration 004 to have been applied. This rewrites both the
-- activity_logs entity_type check constraint and handle_new_workspace() as 004
-- left them; running it against a pre-004 database loses 004's changes.
--
-- Safe to re-run: every object is created with `if not exists` or dropped first.

-- ---------------------------------------------------------------------------
-- 1. Collections — the top-level shelves.
-- ---------------------------------------------------------------------------
create table if not exists public.doc_collections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  icon text,
  color text not null default '#6B7280',
  position integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create unique index if not exists doc_collections_workspace_name_key
  on public.doc_collections (workspace_id, lower(btrim(name)));

-- ---------------------------------------------------------------------------
-- 2. Docs
--
-- text + check rather than a Postgres enum, matching priority / entity_type /
-- project status elsewhere in this schema: adding a value to an enum is a migration.
-- ---------------------------------------------------------------------------
create table if not exists public.docs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- Losing a shelf must not delete the documents on it.
  collection_id uuid references public.doc_collections(id) on delete set null,
  parent_id uuid references public.docs(id) on delete cascade,
  -- Only meaningful when visibility = 'team'.
  team_id uuid references public.teams(id) on delete set null,
  title text not null default 'Untitled',
  content text not null default '',
  -- Plain-text mirror of content, written by the client. Search over HTML matches
  -- markup, not prose.
  content_text text not null default '',
  icon text,
  visibility text not null default 'workspace'
    check (visibility in ('workspace', 'team', 'private')),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  position integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Created now although search is phase 2: adding a STORED generated column to a
-- populated table rewrites the whole table.
--
-- to_tsvector's two-argument form is IMMUTABLE, which a generated column requires.
-- The single-argument form is not and is rejected here.
alter table public.docs drop column if exists search_vector;
alter table public.docs add column search_vector tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content_text, '')), 'B')
  ) stored;

create index if not exists idx_docs_search on public.docs using gin (search_vector);
create index if not exists idx_docs_workspace on public.docs(workspace_id, deleted_at);
create index if not exists idx_docs_parent on public.docs(parent_id, position);
create index if not exists idx_docs_collection on public.docs(collection_id, position);

-- ---------------------------------------------------------------------------
-- 3. Templates
--
-- Their own table rather than docs flagged is_template: a flag would have to be
-- excluded from the tree, from search, from "recently edited" and from breadcrumbs.
-- ---------------------------------------------------------------------------
create table if not exists public.doc_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text not null default '',
  category text not null default 'General',
  icon text,
  content text not null default '',
  -- Marks the seeded set: lets the UI offer "reset to default" and lets re-seeding
  -- skip them. Seeded templates are still editable.
  is_builtin boolean not null default false,
  position integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create unique index if not exists doc_templates_workspace_name_key
  on public.doc_templates (workspace_id, lower(btrim(name)));

-- ---------------------------------------------------------------------------
-- 4. Tree integrity
-- ---------------------------------------------------------------------------

-- Moving a doc under its own descendant orphans a subtree and makes the recursive
-- tree query run forever. Walk the proposed ancestry and refuse if we meet ourselves.
create or replace function public.docs_prevent_cycle()
returns trigger as $fn$
declare
  v_ancestor uuid;
  v_guard integer := 0;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'A document cannot be its own parent.';
  end if;

  v_ancestor := new.parent_id;
  while v_ancestor is not null loop
    v_guard := v_guard + 1;
    -- Belt and braces: if the existing tree is already corrupt, fail rather than spin.
    if v_guard > 10000 then
      raise exception 'Document hierarchy is too deep or already contains a cycle.';
    end if;

    if v_ancestor = new.id then
      raise exception 'That move would put the document inside its own subtree.';
    end if;

    select parent_id into v_ancestor from public.docs where id = v_ancestor;
  end loop;

  return new;
end;
$fn$ language plpgsql;

drop trigger if exists trg_docs_prevent_cycle on public.docs;
create trigger trg_docs_prevent_cycle
  before insert or update of parent_id on public.docs
  for each row
  execute function public.docs_prevent_cycle();

-- `on delete cascade` only fires on a hard delete. Soft-deleting a parent must carry
-- the whole subtree with it, or the children survive as unreachable orphans.
create or replace function public.docs_cascade_soft_delete()
returns trigger as $fn$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    with recursive subtree as (
      select id from public.docs where parent_id = new.id
      union all
      select d.id from public.docs d join subtree s on d.parent_id = s.id
    )
    update public.docs
       set deleted_at = new.deleted_at,
           deleted_by = new.deleted_by
     where id in (select id from subtree)
       and deleted_at is null;

  elsif new.deleted_at is null and old.deleted_at is not null then
    -- Restoring a parent restores everything that went down with it.
    with recursive subtree as (
      select id from public.docs where parent_id = new.id
      union all
      select d.id from public.docs d join subtree s on d.parent_id = s.id
    )
    update public.docs
       set deleted_at = null,
           deleted_by = null
     where id in (select id from subtree)
       and deleted_at = old.deleted_at;
  end if;

  return new;
end;
$fn$ language plpgsql;

drop trigger if exists trg_docs_cascade_soft_delete on public.docs;
create trigger trg_docs_cascade_soft_delete
  after update of deleted_at on public.docs
  for each row
  execute function public.docs_cascade_soft_delete();

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------
alter table public.doc_collections enable row level security;
alter table public.docs enable row level security;
alter table public.doc_templates enable row level security;

-- Collections: members read, admins write. Same shape as ticket_types in 004.
drop policy if exists "Members can view doc collections" on public.doc_collections;
create policy "Members can view doc collections"
  on public.doc_collections for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists "Admins can manage doc collections" on public.doc_collections;
create policy "Admins can manage doc collections"
  on public.doc_collections for all
  to authenticated
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

-- Docs. The read predicate is reused verbatim for update: anyone who can read a
-- document can edit it. That is the wiki model, and gated editing is how wikis
-- go stale. Deletion is narrower.
drop policy if exists "Members can view docs" on public.docs;
create policy "Members can view docs"
  on public.docs for select
  to authenticated
  using (
    public.is_workspace_member(workspace_id)
    and (
      visibility = 'workspace'
      or (visibility = 'team' and team_id is not null and public.is_team_member(team_id))
      or (visibility = 'private' and created_by = auth.uid())
    )
  );

drop policy if exists "Members can create docs" on public.docs;
create policy "Members can create docs"
  on public.docs for insert
  to authenticated
  with check (
    public.is_workspace_member(workspace_id)
    and created_by = auth.uid()
  );

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
  );

drop policy if exists "Authors and admins can delete docs" on public.docs;
create policy "Authors and admins can delete docs"
  on public.docs for delete
  to authenticated
  using (
    public.is_workspace_member(workspace_id)
    and (public.is_workspace_admin(workspace_id) or created_by = auth.uid())
  );

-- Templates: members read, admins write.
drop policy if exists "Members can view doc templates" on public.doc_templates;
create policy "Members can view doc templates"
  on public.doc_templates for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists "Admins can manage doc templates" on public.doc_templates;
create policy "Admins can manage doc templates"
  on public.doc_templates for all
  to authenticated
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

-- ---------------------------------------------------------------------------
-- 6. Activity log gains 'doc'.
--    004 set this list to (ticket, project, test_case, comment); read the existing
--    constraint off the catalog rather than assuming either version.
-- ---------------------------------------------------------------------------
do $$
declare v_conname text;
begin
  select c.conname into v_conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public' and t.relname = 'activity_logs'
     and c.contype = 'c'
     and pg_get_constraintdef(c.oid) ilike '%entity_type%';

  if v_conname is not null then
    execute format('alter table public.activity_logs drop constraint %I', v_conname);
  end if;
end $$;

alter table public.activity_logs
  add constraint activity_logs_entity_type_check
  check (entity_type in ('ticket', 'project', 'test_case', 'comment', 'doc'));

-- ---------------------------------------------------------------------------
-- 7. Seeding
-- ---------------------------------------------------------------------------
create or replace function public.seed_default_doc_collections(p_workspace_id uuid)
returns void as $fn$
begin
  insert into public.doc_collections (workspace_id, name, icon, color, position)
  values
    (p_workspace_id, 'Company',       'building-2',   '#B37FEB', 0),
    (p_workspace_id, 'Product',       'package',      '#1ED760', 1),
    (p_workspace_id, 'Engineering',   'code',         '#4A7BB5', 2),
    (p_workspace_id, 'Operations',    'settings',     '#D48C45', 3),
    (p_workspace_id, 'People',        'users',        '#F5C842', 4),
    (p_workspace_id, 'Go-to-market',  'megaphone',    '#B55151', 5),
    (p_workspace_id, 'Meetings',      'calendar',     '#6B7280', 6)
  on conflict do nothing;
end;
$fn$ language plpgsql security definer;

create or replace function public.seed_default_doc_templates(p_workspace_id uuid)
returns void as $fn$
begin
  insert into public.doc_templates (workspace_id, name, description, category, icon, content, is_builtin, position)
  values
  (p_workspace_id, 'PRD', 'Product requirements: the problem, who has it, and what done looks like.', 'Product', 'package',
$html$<h2>Problem</h2><p><em>What are we solving, and for whom? Why now?</em></p><p></p>
<h2>Goals</h2><ul><li><p></p></li></ul>
<h2>Non-goals</h2><p><em>Naming what this explicitly does not cover prevents scope drift later.</em></p><ul><li><p></p></li></ul>
<h2>Users</h2><p></p>
<h2>Requirements</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p></p></li></ul>
<h2>Success metrics</h2><p><em>How will we know this worked?</em></p><p></p>
<h2>Open questions</h2><ul><li><p></p></li></ul>$html$, true, 0),

  (p_workspace_id, 'Technical Design (RFC)', 'Propose a technical approach and the alternatives considered.', 'Engineering', 'file-code',
$html$<h2>Context</h2><p><em>What exists today, and what forces the change?</em></p><p></p>
<h2>Proposal</h2><p></p>
<h2>Alternatives considered</h2><p><em>Include the option of doing nothing.</em></p><ul><li><p></p></li></ul>
<h2>Risks</h2><ul><li><p></p></li></ul>
<h2>Rollout</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p></p></li></ul>
<h2>Open questions</h2><ul><li><p></p></li></ul>$html$, true, 1),

  (p_workspace_id, 'Architecture Decision Record', 'One decision, why it was made, and what it costs.', 'Engineering', 'git-branch',
$html$<h2>Status</h2><p><em>Proposed / Accepted / Superseded by …</em></p><p></p>
<h2>Context</h2><p><em>The forces at play. Write this so it still makes sense in two years.</em></p><p></p>
<h2>Decision</h2><p></p>
<h2>Consequences</h2><p><em>Both the good and the bad. An ADR with no downsides is not finished.</em></p><p></p>$html$, true, 2),

  (p_workspace_id, 'Runbook', 'Step-by-step operational procedure for a known task.', 'Engineering', 'book-open',
$html$<h2>Purpose</h2><p></p>
<h2>Prerequisites</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p></p></li></ul>
<h2>Steps</h2><ol><li><p></p></li></ol>
<h2>Verification</h2><p><em>How do you know it worked?</em></p><p></p>
<h2>Rollback</h2><p></p>
<h2>Escalation</h2><p><em>Who to wake, and at what threshold.</em></p><p></p>$html$, true, 3),

  (p_workspace_id, 'Incident Postmortem', 'Blameless review of an incident and what changes because of it.', 'Engineering', 'alert-triangle',
$html$<h2>Summary</h2><p></p>
<h2>Impact</h2><p><em>Who was affected, how badly, for how long.</em></p><p></p>
<h2>Timeline</h2><p><em>Times in UTC. Detection, escalation, mitigation, resolution.</em></p><ul><li><p></p></li></ul>
<h2>Root cause</h2><p></p>
<h2>What went well</h2><ul><li><p></p></li></ul>
<h2>Action items</h2><p><em>Each one owned and dated, or it will not happen.</em></p><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p></p></li></ul>$html$, true, 4),

  (p_workspace_id, 'Meeting Notes', 'Attendees, decisions, and who owns what next.', 'Meetings', 'calendar',
$html$<h2>Attendees</h2><p></p>
<h2>Agenda</h2><ul><li><p></p></li></ul>
<h2>Notes</h2><p></p>
<h2>Decisions</h2><ul><li><p></p></li></ul>
<h2>Action items</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p></p></li></ul>$html$, true, 5),

  (p_workspace_id, 'Retro', 'What worked, what did not, and what changes next cycle.', 'Meetings', 'repeat',
$html$<h2>Went well</h2><ul><li><p></p></li></ul>
<h2>Did not go well</h2><ul><li><p></p></li></ul>
<h2>Action items</h2><p><em>Two or three you will actually do, not ten you will not.</em></p><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p></p></li></ul>$html$, true, 6),

  (p_workspace_id, 'Onboarding Checklist', 'A new joiner''s first month, in order.', 'People', 'user-plus',
$html$<h2>Before day one</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p></p></li></ul>
<h2>Day one</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p></p></li></ul>
<h2>Week one</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p></p></li></ul>
<h2>Month one</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p></p></li></ul>$html$, true, 7),

  (p_workspace_id, 'SOP', 'A standard operating procedure someone else can follow unaided.', 'Operations', 'clipboard-list',
$html$<h2>Purpose</h2><p></p>
<h2>Scope</h2><p><em>When this applies, and when it does not.</em></p><p></p>
<h2>Responsibilities</h2><p></p>
<h2>Procedure</h2><ol><li><p></p></li></ol>
<h2>Review cadence</h2><p><em>An unreviewed SOP is a wrong SOP.</em></p><p></p>$html$, true, 8),

  (p_workspace_id, 'Weekly Update', 'The week in one page: progress, numbers, and blockers.', 'Company', 'trending-up',
$html$<h2>Highlights</h2><ul><li><p></p></li></ul>
<h2>Metrics</h2><p></p>
<h2>Lowlights</h2><p><em>Say the hard thing here. This section is the point of the document.</em></p><ul><li><p></p></li></ul>
<h2>Next week</h2><ul><li><p></p></li></ul>
<h2>Asks</h2><ul><li><p></p></li></ul>$html$, true, 9),

  (p_workspace_id, 'Customer Interview', 'Raw notes and quotes from one conversation.', 'Go-to-market', 'message-circle',
$html$<h2>Participant</h2><p><em>Role, company, segment, date.</em></p><p></p>
<h2>Context</h2><p></p>
<h2>Questions</h2><ul><li><p></p></li></ul>
<h2>Quotes</h2><p><em>Verbatim. Paraphrase loses the signal.</em></p><blockquote><p></p></blockquote>
<h2>Takeaways</h2><ul><li><p></p></li></ul>$html$, true, 10),

  (p_workspace_id, 'Release Notes', 'What shipped, what broke, and what to do about it.', 'Product', 'rocket',
$html$<h2>Version</h2><p></p>
<h2>Highlights</h2><ul><li><p></p></li></ul>
<h2>Fixes</h2><ul><li><p></p></li></ul>
<h2>Breaking changes</h2><p><em>Empty is a valid answer. Leaving it out is not.</em></p><ul><li><p></p></li></ul>
<h2>Upgrade notes</h2><p></p>$html$, true, 11)
  on conflict do nothing;
end;
$fn$ language plpgsql security definer;

-- handle_new_workspace was last rewritten by 004 to seed ticket types. This carries
-- both prior calls plus the two new ones.
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
  return new;
end;
$fn$ language plpgsql security definer;

-- Backfill existing workspaces.
do $$
declare w record;
begin
  for w in select id from public.workspaces loop
    if not exists (select 1 from public.doc_collections where workspace_id = w.id) then
      perform public.seed_default_doc_collections(w.id);
    end if;
    if not exists (select 1 from public.doc_templates where workspace_id = w.id) then
      perform public.seed_default_doc_templates(w.id);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

-- Confirm: every workspace has 7 collections and 12 templates.
select w.name as workspace,
       (select count(*) from public.doc_collections c where c.workspace_id = w.id) as collections,
       (select count(*) from public.doc_templates t where t.workspace_id = w.id) as templates
  from public.workspaces w
 order by w.name;
