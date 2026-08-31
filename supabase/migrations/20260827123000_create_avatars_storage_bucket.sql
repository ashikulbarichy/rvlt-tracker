-- Migration: 20260827123000_create_avatars_storage_bucket.sql
-- Description: Create avatars storage bucket and configure Row Level Security (RLS) policies.

-- 1. Create the 'avatars' storage bucket if it does not already exist
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880, -- 5 MB limit
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- 2. Storage RLS Policies for the 'avatars' bucket

-- Public read access: Anyone (anon or authenticated) can view avatar images
drop policy if exists "Avatars public read access" on storage.objects;
create policy "Avatars public read access"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- Authenticated upload access: Logged-in users can upload avatars
drop policy if exists "Authenticated users can upload avatars" on storage.objects;
create policy "Authenticated users can upload avatars"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars');

-- Authenticated update access: Logged-in users can update their avatar
drop policy if exists "Authenticated users can update avatars" on storage.objects;
create policy "Authenticated users can update avatars"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars');

-- Authenticated delete access: Logged-in users can delete their avatar
drop policy if exists "Authenticated users can delete avatars" on storage.objects;
create policy "Authenticated users can delete avatars"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars');
