-- 004 step 4: remove story points.
--
-- SEPARATE AND LAST, because this is the only irreversible step in 004. Everything
-- before it is a rename or an addition; this destroys data.
--
-- Do not run it with the others. Run steps 1-3, deploy the matching build, confirm the
-- app works, and only then run this.
--
-- The values are recoverable from backup.issues_pre_004 for as long as that snapshot
-- survives:
--
--   alter table public.tickets add column estimate integer;
--   update public.tickets t
--      set estimate = b.estimate
--     from backup.issues_pre_004 b
--    where b.id = t.id;

alter table public.tickets drop column if exists estimate;

notify pgrst, 'reload schema';
