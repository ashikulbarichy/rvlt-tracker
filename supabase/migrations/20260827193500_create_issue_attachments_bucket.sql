-- Migration: 20260827193500_create_issue_attachments_bucket.sql
-- Description: Create issue_attachments storage bucket and configure Row Level Security (RLS) policies.

-- 1. Create the 'issue_attachments' storage bucket if it does not already exist
SET role postgres;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'issue_attachments',
  'issue_attachments',
  true,
  10485760, -- 10 MB limit
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];

-- 2. Storage RLS Policies for the 'issue_attachments' bucket

-- Public read access: Anyone can view attachments
drop policy if exists "Issue attachments public read access" on storage.objects;
create policy "Issue attachments public read access"
  on storage.objects for select
  using (bucket_id = 'issue_attachments');

-- Authenticated upload access: Logged-in users can upload attachments
drop policy if exists "Authenticated users can upload issue attachments" on storage.objects;
create policy "Authenticated users can upload issue attachments"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'issue_attachments');

-- Authenticated delete access: Logged-in users can delete their own uploaded attachments
drop policy if exists "Authenticated users can delete issue attachments" on storage.objects;
create policy "Authenticated users can delete issue attachments"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'issue_attachments' and owner = auth.uid());
