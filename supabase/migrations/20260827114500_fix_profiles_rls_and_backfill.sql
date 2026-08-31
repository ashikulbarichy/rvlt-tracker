-- Migration: 20260827114500_fix_profiles_rls_and_backfill.sql
-- Description: Add missing INSERT policy on public.profiles, backfill missing profiles from auth.users, and enhance handle_new_user trigger.

-- 1. Ensure INSERT policy exists for public.profiles so authenticated users can insert/upsert their profile
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' 
      and tablename = 'profiles' 
      and policyname = 'Users can insert their own profile'
  ) then
    create policy "Users can insert their own profile"
      on public.profiles for insert
      to authenticated
      with check (auth.uid() = id);
  end if;
end $$;

-- 2. Backfill existing auth.users that don't have a profile yet
insert into public.profiles (id, email, full_name, avatar_url, created_at, updated_at)
select 
  u.id,
  coalesce(u.email, ''),
  coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
  u.raw_user_meta_data->>'avatar_url',
  u.created_at,
  now()
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
)
on conflict (id) do update
set 
  email = excluded.email,
  full_name = coalesce(public.profiles.full_name, excluded.full_name),
  updated_at = now();

-- 3. Robust trigger function for future user creations/updates
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update
  set 
    email = coalesce(excluded.email, public.profiles.email, ''),
    full_name = case 
      when excluded.full_name is not null and excluded.full_name <> '' 
      then excluded.full_name 
      else public.profiles.full_name 
    end,
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

-- 4. Allow email to have a default empty string so partial upserts never fail with not-null constraint errors
alter table public.profiles alter column email set default '';

