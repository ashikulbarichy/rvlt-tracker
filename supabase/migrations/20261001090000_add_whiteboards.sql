-- 013: collaborative whiteboards in Docs.
--
-- A whiteboard is a document of kind 'whiteboard'. It inherits everything a page has --
-- the tree, visibility, per-member/per-team view/edit shares, trash, search, @ links --
-- so none of the access model is rebuilt here. What is new is where the canvas lives:
--
--   doc_board_elements  one row per shape, last-writer-wins per shape by version
--   doc_board_comments  pinned comment threads on the canvas
--   doc_boards          per-board session state: the shared timer and voting
--   doc_board_votes     dot votes cast during a voting session
--   storage board-files private bucket for images and the board thumbnail
--   realtime            private broadcast/presence channels "board:<doc id>"
--
-- Access, stated once:
--   * can see the document   -> read the board, comment, vote, show a cursor
--   * can edit the document  -> change shapes, upload images, run the timer and votes
--
-- To undo:
--   drop table if exists public.doc_board_votes, public.doc_boards,
--     public.doc_board_comments, public.doc_board_elements cascade;
--   drop function if exists public.board_apply_elements(uuid, jsonb);
--   drop function if exists public.can_view_doc(uuid);
--   drop function if exists public.can_edit_doc(uuid);
--   drop function if exists public.board_path_doc_id(text);
--   drop function if exists public.board_votes_within_budget();
--   drop function if exists public.docs_guard_kind_change() cascade;
--   drop policy ... on storage.objects / realtime.messages (names below);
--   alter table public.docs drop column if exists kind;
--
-- REQUIRES 20260927090000 (doc_shares, can_edit_shared_doc).

-- ---------------------------------------------------------------------------
-- 1. Document kind
-- ---------------------------------------------------------------------------
alter table public.docs
  add column if not exists kind text not null default 'page';

alter table public.docs drop constraint if exists docs_kind_check;
alter table public.docs add constraint docs_kind_check
  check (kind in ('page', 'whiteboard'));

-- A page's HTML means nothing to a canvas and the reverse, so kind is fixed at creation.
create or replace function public.docs_guard_kind_change()
returns trigger as $fn$
begin
  if new.kind is distinct from old.kind then
    raise exception 'A document cannot change between page and whiteboard'
      using errcode = '42501';
  end if;
  return new;
end;
$fn$ language plpgsql;

drop trigger if exists docs_guard_kind on public.docs;
create trigger docs_guard_kind
  before update of kind on public.docs
  for each row execute function public.docs_guard_kind_change();

-- ---------------------------------------------------------------------------
-- 2. Access helpers
--
-- can_view_doc is SECURITY INVOKER on purpose: it asks "can this caller select the
-- row?", so it is the docs SELECT policy itself, not a copy that could drift from it.
--
-- can_edit_doc cannot be phrased that way (there is no side-effect-free way to ask
-- whether an UPDATE would pass), so it restates the docs UPDATE policy from
-- 20260927090000. If that policy ever changes, change this with it.
-- ---------------------------------------------------------------------------
create or replace function public.can_view_doc(p_doc_id uuid)
returns boolean as $fn$
  select exists (select 1 from public.docs d where d.id = p_doc_id);
$fn$ language sql security invoker stable;

create or replace function public.can_edit_doc(p_doc_id uuid)
returns boolean as $fn$
  select exists (
    select 1 from public.docs d
     where d.id = p_doc_id
       and d.deleted_at is null
       and public.is_workspace_member(d.workspace_id)
       and (
         d.visibility = 'workspace'
         or d.created_by = auth.uid()
         or public.is_workspace_admin(d.workspace_id)
         or (d.visibility = 'restricted' and public.can_edit_shared_doc(d.id))
       )
  );
$fn$ language sql security definer stable set search_path = public;

-- "board:<uuid>" or "<uuid>/file.png" -> the uuid, or null for anything malformed.
-- A cast that throws inside a policy would turn a bad topic into a server error rather
-- than a plain refusal.
create or replace function public.board_path_doc_id(p_value text)
returns uuid as $fn$
  select case
    when m[1] is not null then m[1]::uuid
    else null
  end
  from (
    select regexp_match(
      coalesce(p_value, ''),
      '^(?:board:)?([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(?:/.*)?$'
    ) as m
  ) s;
$fn$ language sql immutable;

revoke all on function public.can_edit_doc(uuid) from public;
grant execute on function public.can_edit_doc(uuid) to authenticated;
grant execute on function public.can_view_doc(uuid) to authenticated;
grant execute on function public.board_path_doc_id(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Shapes
--
-- One row per Excalidraw element. `data` is the element as the client sent it;
-- version/version_nonce are lifted out of it so the merge rule can run in SQL. Deleted
-- shapes stay as tombstones (is_deleted) so a late write from a stale client cannot
-- bring them back.
-- ---------------------------------------------------------------------------
create table if not exists public.doc_board_elements (
  doc_id uuid not null references public.docs(id) on delete cascade,
  element_id text not null,
  data jsonb not null,
  version integer not null,
  version_nonce bigint not null default 0,
  is_deleted boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (doc_id, element_id),
  constraint doc_board_elements_id_len check (char_length(element_id) between 1 and 100),
  -- A shape is small; images live in storage, not inline. This stops a data URL or a
  -- runaway payload being written into the table.
  constraint doc_board_elements_size check (pg_column_size(data) < 200000)
);

create index if not exists idx_doc_board_elements_updated
  on public.doc_board_elements (doc_id, updated_at);

alter table public.doc_board_elements enable row level security;

drop policy if exists "Board viewers read shapes" on public.doc_board_elements;
create policy "Board viewers read shapes"
  on public.doc_board_elements for select
  to authenticated
  using (public.can_view_doc(doc_id));

drop policy if exists "Board editors add shapes" on public.doc_board_elements;
create policy "Board editors add shapes"
  on public.doc_board_elements for insert
  to authenticated
  with check (public.can_edit_doc(doc_id));

drop policy if exists "Board editors change shapes" on public.doc_board_elements;
create policy "Board editors change shapes"
  on public.doc_board_elements for update
  to authenticated
  using (public.can_edit_doc(doc_id))
  with check (public.can_edit_doc(doc_id));

-- No DELETE policy: removal is a tombstone. Rows go when the document is deleted.

-- Apply a batch of shapes, keeping whichever copy of each is newer: higher version
-- wins, a tie goes to the lower nonce -- the rule Excalidraw's own collaboration uses,
-- so every client and the database converge on the same shape.
--
-- SECURITY INVOKER: the table policies above are the permission check.
create or replace function public.board_apply_elements(p_doc_id uuid, p_elements jsonb)
returns integer as $fn$
declare
  v_kind text;
  v_count integer;
begin
  select kind into v_kind from public.docs where id = p_doc_id;
  if v_kind is null then
    raise exception 'Whiteboard not found' using errcode = 'P0002';
  end if;
  if v_kind <> 'whiteboard' then
    raise exception 'This document is not a whiteboard' using errcode = '22023';
  end if;
  if jsonb_typeof(p_elements) <> 'array' then
    raise exception 'Expected an array of elements' using errcode = '22023';
  end if;
  if jsonb_array_length(p_elements) > 2000 then
    raise exception 'Too many shapes in one save' using errcode = '22023';
  end if;

  insert into public.doc_board_elements as e
    (doc_id, element_id, data, version, version_nonce, is_deleted, updated_by, updated_at)
  select p_doc_id,
         el->>'id',
         el,
         coalesce((el->>'version')::integer, 1),
         coalesce((el->>'versionNonce')::bigint, 0),
         coalesce((el->>'isDeleted')::boolean, false),
         auth.uid(),
         now()
    from jsonb_array_elements(p_elements) el
   where el->>'id' is not null
  on conflict (doc_id, element_id) do update
     set data = excluded.data,
         version = excluded.version,
         version_nonce = excluded.version_nonce,
         is_deleted = excluded.is_deleted,
         updated_by = excluded.updated_by,
         updated_at = excluded.updated_at
   where excluded.version > e.version
      or (excluded.version = e.version and excluded.version_nonce < e.version_nonce);

  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$ language plpgsql security invoker;

revoke all on function public.board_apply_elements(uuid, jsonb) from public;
grant execute on function public.board_apply_elements(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Comments
--
-- A thread is a root comment pinned at (x, y) in canvas coordinates; replies point at
-- it. Anyone who can see the board may comment, as in FigJam; only the author edits or
-- deletes a comment, and the author or a board editor may resolve a thread.
-- ---------------------------------------------------------------------------
create table if not exists public.doc_board_comments (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references public.docs(id) on delete cascade,
  parent_id uuid references public.doc_board_comments(id) on delete cascade,
  x double precision,
  y double precision,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A root has a position and no parent; a reply has a parent and no position.
  constraint doc_board_comments_shape check (
    (parent_id is null and x is not null and y is not null)
    or (parent_id is not null and x is null and y is null)
  )
);

create index if not exists idx_doc_board_comments_doc
  on public.doc_board_comments (doc_id, created_at);
create index if not exists idx_doc_board_comments_parent
  on public.doc_board_comments (parent_id);

-- A reply must belong to the same board as its thread.
create or replace function public.doc_board_comments_same_board()
returns trigger as $fn$
begin
  if new.parent_id is not null and not exists (
    select 1 from public.doc_board_comments p
     where p.id = new.parent_id and p.doc_id = new.doc_id and p.parent_id is null
  ) then
    raise exception 'A reply must answer a thread on the same board' using errcode = '23514';
  end if;
  return new;
end;
$fn$ language plpgsql security definer set search_path = public;

drop trigger if exists doc_board_comments_same_board on public.doc_board_comments;
create trigger doc_board_comments_same_board
  before insert or update of parent_id, doc_id on public.doc_board_comments
  for each row execute function public.doc_board_comments_same_board();

alter table public.doc_board_comments enable row level security;

drop policy if exists "Board viewers read comments" on public.doc_board_comments;
create policy "Board viewers read comments"
  on public.doc_board_comments for select
  to authenticated
  using (public.can_view_doc(doc_id));

drop policy if exists "Board viewers comment" on public.doc_board_comments;
create policy "Board viewers comment"
  on public.doc_board_comments for insert
  to authenticated
  with check (author_id = auth.uid() and public.can_view_doc(doc_id));

drop policy if exists "Authors and editors update comments" on public.doc_board_comments;
create policy "Authors and editors update comments"
  on public.doc_board_comments for update
  to authenticated
  using (
    public.can_view_doc(doc_id)
    and (author_id = auth.uid() or public.can_edit_doc(doc_id))
  )
  with check (
    public.can_view_doc(doc_id)
    and (author_id = auth.uid() or public.can_edit_doc(doc_id))
  );

drop policy if exists "Authors delete comments" on public.doc_board_comments;
create policy "Authors delete comments"
  on public.doc_board_comments for delete
  to authenticated
  using (author_id = auth.uid() and public.can_view_doc(doc_id));

-- An editor may resolve someone else's thread but not rewrite their words.
create or replace function public.doc_board_comments_guard_edit()
returns trigger as $fn$
begin
  if new.body is distinct from old.body and old.author_id <> auth.uid() then
    raise exception 'Only the author can edit a comment' using errcode = '42501';
  end if;
  if new.author_id is distinct from old.author_id then
    raise exception 'A comment''s author cannot change' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$fn$ language plpgsql;

drop trigger if exists doc_board_comments_guard_edit on public.doc_board_comments;
create trigger doc_board_comments_guard_edit
  before update on public.doc_board_comments
  for each row execute function public.doc_board_comments_guard_edit();

-- ---------------------------------------------------------------------------
-- 5. Session state: the shared timer and voting
-- ---------------------------------------------------------------------------
create table if not exists public.doc_boards (
  doc_id uuid primary key references public.docs(id) on delete cascade,
  timer_ends_at timestamptz,
  -- Set while paused: seconds left when the pause was pressed.
  timer_paused_remaining integer check (timer_paused_remaining is null or timer_paused_remaining >= 0),
  timer_duration integer check (timer_duration is null or timer_duration between 1 and 86400),
  voting_open boolean not null default false,
  votes_per_person integer not null default 3 check (votes_per_person between 1 and 50),
  -- Bumped when a new voting session starts, so old votes do not count toward it.
  voting_round integer not null default 0,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.doc_boards enable row level security;

drop policy if exists "Board viewers read session" on public.doc_boards;
create policy "Board viewers read session"
  on public.doc_boards for select
  to authenticated
  using (public.can_view_doc(doc_id));

drop policy if exists "Board editors start session" on public.doc_boards;
create policy "Board editors start session"
  on public.doc_boards for insert
  to authenticated
  with check (public.can_edit_doc(doc_id));

drop policy if exists "Board editors run session" on public.doc_boards;
create policy "Board editors run session"
  on public.doc_boards for update
  to authenticated
  using (public.can_edit_doc(doc_id))
  with check (public.can_edit_doc(doc_id));

-- ---------------------------------------------------------------------------
-- 6. Votes
--
-- One row per (board, round, shape, voter) holding how many dots that voter put on it.
-- Viewers can vote: voting is taking part, not editing the canvas. A trigger keeps each
-- voter within the round's budget.
-- ---------------------------------------------------------------------------
create table if not exists public.doc_board_votes (
  doc_id uuid not null references public.docs(id) on delete cascade,
  voting_round integer not null,
  element_id text not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  votes integer not null check (votes between 1 and 50),
  created_at timestamptz not null default now(),
  primary key (doc_id, voting_round, element_id, user_id)
);

create index if not exists idx_doc_board_votes_round
  on public.doc_board_votes (doc_id, voting_round);

create or replace function public.board_votes_within_budget()
returns trigger as $fn$
declare
  v_budget integer;
  v_round integer;
  v_open boolean;
  v_used integer;
begin
  select votes_per_person, voting_round, voting_open
    into v_budget, v_round, v_open
    from public.doc_boards
   where doc_id = new.doc_id;

  if not coalesce(v_open, false) then
    raise exception 'Voting is not open on this board' using errcode = '42501';
  end if;
  if new.voting_round <> v_round then
    raise exception 'That voting session has ended' using errcode = '42501';
  end if;

  select coalesce(sum(votes), 0) into v_used
    from public.doc_board_votes
   where doc_id = new.doc_id
     and voting_round = new.voting_round
     and user_id = new.user_id
     and element_id <> new.element_id;

  if v_used + new.votes > v_budget then
    raise exception 'You have used all % of your votes', v_budget using errcode = '23514';
  end if;
  return new;
end;
$fn$ language plpgsql security definer set search_path = public;

drop trigger if exists board_votes_within_budget on public.doc_board_votes;
create trigger board_votes_within_budget
  before insert or update on public.doc_board_votes
  for each row execute function public.board_votes_within_budget();

alter table public.doc_board_votes enable row level security;

drop policy if exists "Board viewers read votes" on public.doc_board_votes;
create policy "Board viewers read votes"
  on public.doc_board_votes for select
  to authenticated
  using (public.can_view_doc(doc_id));

drop policy if exists "Board viewers cast votes" on public.doc_board_votes;
create policy "Board viewers cast votes"
  on public.doc_board_votes for insert
  to authenticated
  with check (user_id = auth.uid() and public.can_view_doc(doc_id));

drop policy if exists "Voters change their votes" on public.doc_board_votes;
create policy "Voters change their votes"
  on public.doc_board_votes for update
  to authenticated
  using (user_id = auth.uid() and public.can_view_doc(doc_id))
  with check (user_id = auth.uid() and public.can_view_doc(doc_id));

-- A voter takes back their own dots; an editor may clear a finished session.
drop policy if exists "Voters and editors remove votes" on public.doc_board_votes;
create policy "Voters and editors remove votes"
  on public.doc_board_votes for delete
  to authenticated
  using (
    public.can_view_doc(doc_id)
    and (user_id = auth.uid() or public.can_edit_doc(doc_id))
  );

-- ---------------------------------------------------------------------------
-- 7. Storage: private bucket for board images and thumbnails
--
-- Private, unlike the avatar and attachment buckets: a restricted moodboard's images
-- must be as restricted as the board. Objects live at "<doc id>/<file>", and the first
-- path segment is what every policy checks. The client reads through signed URLs.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'board-files', 'board-files', false, 10485760,
  array['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Board viewers read board files" on storage.objects;
create policy "Board viewers read board files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'board-files' and public.can_view_doc(public.board_path_doc_id(name)));

drop policy if exists "Board editors upload board files" on storage.objects;
create policy "Board editors upload board files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'board-files' and public.can_edit_doc(public.board_path_doc_id(name)));

-- UPDATE is what an upsert does when the object exists: the thumbnail is rewritten.
drop policy if exists "Board editors replace board files" on storage.objects;
create policy "Board editors replace board files"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'board-files' and public.can_edit_doc(public.board_path_doc_id(name)))
  with check (bucket_id = 'board-files' and public.can_edit_doc(public.board_path_doc_id(name)));

drop policy if exists "Board editors remove board files" on storage.objects;
create policy "Board editors remove board files"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'board-files' and public.can_edit_doc(public.board_path_doc_id(name)));

-- ---------------------------------------------------------------------------
-- 8. Realtime: private channels "board:<doc id>"
--
-- Live shapes, cursors, cursor chat and presence travel over broadcast/presence. The
-- client joins with { private: true }, which makes Realtime check these policies.
-- Anyone who can see the board may join and send: cursors and chat come from viewers
-- too, and Realtime authorises per channel, not per event. The database, not the
-- channel, is the authority for shapes -- a viewer cannot persist anything, and every
-- client reloads from the table on join.
-- ---------------------------------------------------------------------------
drop policy if exists "Board viewers receive board channel" on realtime.messages;
create policy "Board viewers receive board channel"
  on realtime.messages for select
  to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and public.can_view_doc(public.board_path_doc_id((select realtime.topic())))
  );

drop policy if exists "Board viewers send on board channel" on realtime.messages;
create policy "Board viewers send on board channel"
  on realtime.messages for insert
  to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and public.can_view_doc(public.board_path_doc_id((select realtime.topic())))
  );

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Confirm
-- ---------------------------------------------------------------------------
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'docs' and column_name = 'kind') as kind_column,
  (select count(*) from pg_tables
    where schemaname = 'public'
      and tablename in ('doc_board_elements', 'doc_board_comments', 'doc_boards', 'doc_board_votes')) as board_tables,
  (select count(*) from pg_policies
    where schemaname = 'public'
      and tablename in ('doc_board_elements', 'doc_board_comments', 'doc_boards', 'doc_board_votes')) as board_policies,
  (select count(*) from storage.buckets where id = 'board-files' and not public) as private_bucket,
  (select count(*) from pg_policies
    where schemaname = 'realtime' and tablename = 'messages'
      and policyname like 'Board viewers%') as realtime_policies,
  public.board_path_doc_id('board:00000000-0000-0000-0000-000000000001') is not null as topic_parses,
  public.board_path_doc_id('not-a-board') is null as bad_topic_is_null;
