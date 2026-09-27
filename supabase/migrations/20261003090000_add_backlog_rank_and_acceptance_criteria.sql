-- 015: backlog ranking and acceptance criteria (agile phase 4).
--
-- tickets.backlog_rank: the team's backlog order, lowest first. A float so moving one
-- ticket is one update (the midpoint of its new neighbours); the client renumbers the
-- team's backlog on the rare occasion two neighbours get too close. Ordered within a
-- team only -- different teams' ranks are never compared.
--
-- Existing tickets are ranked by priority (urgent first), then oldest first, so the
-- first view of the ranked backlog is already sensible. New tickets go to the bottom:
-- ranking them in is a grooming decision.
--
-- tickets.acceptance_criteria: a checklist, [{ "id", "text", "done" }], for when a
-- ticket counts as done. Edited by whoever can edit the ticket; existing RLS applies.
--
-- To undo:
--   drop trigger if exists tickets_backlog_rank_default on public.tickets;
--   drop function if exists public.tickets_backlog_rank_default();
--   drop index if exists public.idx_tickets_team_rank;
--   alter table public.tickets drop column if exists backlog_rank;
--   alter table public.tickets drop column if exists acceptance_criteria;

alter table public.tickets add column if not exists backlog_rank double precision;

with ranked as (
  select id,
         row_number() over (
           partition by team_id
           order by case priority
                      when 'urgent' then 0 when 'high' then 1 when 'medium' then 2
                      when 'low' then 3 else 4
                    end,
                    created_at
         ) as n
    from public.tickets
   where backlog_rank is null
)
update public.tickets t
   set backlog_rank = r.n * 1024
  from ranked r
 where r.id = t.id;

create index if not exists idx_tickets_team_rank on public.tickets (team_id, backlog_rank);

create or replace function public.tickets_backlog_rank_default()
returns trigger as $fn$
begin
  if new.backlog_rank is null then
    select coalesce(max(backlog_rank), 0) + 1024 into new.backlog_rank
      from public.tickets
     where team_id = new.team_id;
  end if;
  return new;
end;
$fn$ language plpgsql security definer;

drop trigger if exists tickets_backlog_rank_default on public.tickets;
create trigger tickets_backlog_rank_default
  before insert on public.tickets
  for each row execute function public.tickets_backlog_rank_default();

alter table public.tickets
  add column if not exists acceptance_criteria jsonb not null default '[]'::jsonb;

alter table public.tickets drop constraint if exists tickets_acceptance_criteria_array;
alter table public.tickets add constraint tickets_acceptance_criteria_array
  check (jsonb_typeof(acceptance_criteria) = 'array');

notify pgrst, 'reload schema';

-- Confirm, as one row. Expected: 1 | 1 | 1 | 0
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'tickets' and column_name = 'backlog_rank')        as rank_col,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'tickets' and column_name = 'acceptance_criteria') as criteria_col,
  (select count(*) from pg_trigger
    where tgname = 'tickets_backlog_rank_default' and not tgisinternal)                               as rank_trigger,
  (select count(*) from public.tickets where backlog_rank is null)                                    as unranked;
