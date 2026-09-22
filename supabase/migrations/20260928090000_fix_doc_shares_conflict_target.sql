-- 010: let doc_shares be upserted.
--
-- 20260927090000 made the two uniqueness rules PARTIAL indexes:
--
--   (doc_id, user_id) where user_id is not null
--   (doc_id, team_id) where team_id is not null
--
-- Postgres will only use a partial index to resolve ON CONFLICT if the statement
-- repeats the index predicate in its conflict target, and PostgREST's on_conflict
-- parameter takes a column list with nowhere to put one. Re-sharing therefore failed
-- with "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification".
--
-- Plain indexes are usable as a conflict target and lose nothing here. A unique index
-- treats NULLs as distinct, so every team share (user_id null) coexists happily under
-- the user index, and every member share (team_id null) under the team index. What each
-- index actually forbids -- two shares naming the same person, or the same team, on one
-- document -- is unchanged, because those rows have the column set.
--
-- To undo, recreate the two indexes with their `where ... is not null` clauses.
--
-- REQUIRES 20260927090000.

drop index if exists public.doc_shares_doc_user_key;
drop index if exists public.doc_shares_doc_team_key;

create unique index if not exists doc_shares_doc_user_key
  on public.doc_shares (doc_id, user_id);

create unique index if not exists doc_shares_doc_team_key
  on public.doc_shares (doc_id, team_id);

notify pgrst, 'reload schema';

-- Confirm: both indexes exist and neither carries a WHERE clause any more.
select indexname,
       indexdef like '%WHERE%' as is_partial,
       indexdef
  from pg_indexes
 where schemaname = 'public'
   and tablename = 'doc_shares'
 order by indexname;
