-- Vaultspace: Secure Cloud File Storage and Sharing
-- Run this entire file in Supabase Dashboard -> SQL Editor -> New query.
-- Safe to re-run for this prototype (policies are dropped before recreation).

create extension if not exists pgcrypto;

-- Private file metadata. Binary files live in Supabase Storage, not in this table.
create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null check (length(file_name) between 1 and 255),
  storage_path text not null unique,
  file_size bigint not null check (file_size >= 0 and file_size <= 10485760),
  mime_type text not null default 'application/octet-stream',
  created_at timestamptz not null default now()
);

create table if not exists public.file_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  file_id uuid not null references public.files(id) on delete cascade,
  recipient_email text not null check (length(recipient_email) between 3 and 320),
  file_name text not null,
  storage_path text not null,
  permission text not null default 'download' check (permission in ('view', 'download')),
  expires_at timestamptz not null,
  revoked boolean not null default false,
  created_at timestamptz not null default now(),
  constraint share_expiry_reasonable check (expires_at <= created_at + interval '8 days')
);

create index if not exists files_owner_created_idx on public.files(owner_id, created_at desc);
create index if not exists shares_owner_created_idx on public.file_shares(owner_id, created_at desc);
create index if not exists shares_recipient_email_idx on public.file_shares(lower(recipient_email));
create index if not exists shares_storage_path_idx on public.file_shares(storage_path);

alter table public.files enable row level security;
alter table public.file_shares enable row level security;

-- Remove prototype policies if the SQL is run a second time.
drop policy if exists "Owners can read their file metadata" on public.files;
drop policy if exists "Owners can insert their file metadata" on public.files;
drop policy if exists "Owners can update their file metadata" on public.files;
drop policy if exists "Owners can delete their file metadata" on public.files;
drop policy if exists "Share owner or recipient can read share" on public.file_shares;
drop policy if exists "Owners can create shares for their files" on public.file_shares;
drop policy if exists "Owners can update their shares" on public.file_shares;
drop policy if exists "Owners can delete their shares" on public.file_shares;

create policy "Owners can read their file metadata"
on public.files for select to authenticated
using (owner_id = (select auth.uid()));

create policy "Owners can insert their file metadata"
on public.files for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and split_part(storage_path, '/', 1) = (select auth.uid())::text
);

create policy "Owners can update their file metadata"
on public.files for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "Owners can delete their file metadata"
on public.files for delete to authenticated
using (owner_id = (select auth.uid()));

-- Recipients can see only active, unexpired shares addressed to their authenticated email.
-- Owners can see all of their shares, including revoked/expired ones, to manage them.
create policy "Share owner or recipient can read share"
on public.file_shares for select to authenticated
using (
  owner_id = (select auth.uid())
  or (
    lower(recipient_email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
    and revoked = false
    and expires_at > now()
  )
);

create policy "Owners can create shares for their files"
on public.file_shares for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and lower(recipient_email) <> lower(coalesce((select auth.jwt() ->> 'email'), ''))
  and expires_at > now()
  and expires_at <= now() + interval '8 days'
  and exists (
    select 1 from public.files f
    where f.id = file_id and f.owner_id = (select auth.uid())
      and f.storage_path = file_shares.storage_path and f.file_name = file_shares.file_name and f.id = file_shares.file_id
  )
);

create policy "Owners can update their shares"
on public.file_shares for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "Owners can delete their shares"
on public.file_shares for delete to authenticated
using (owner_id = (select auth.uid()));

-- Create a PRIVATE Storage bucket. The browser enforces a 10 MB file limit too,
-- but the bucket-level limit is the authoritative upload-size control.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'secure-files', 'secure-files', false, 10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain', 'text/rtf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'text/csv', 'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip', 'application/x-zip-compressed', 'application/octet-stream'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage RLS: users can upload/read/delete objects in their own UUID folder.
-- A recipient can read a shared object only while the matching share is active.
drop policy if exists "Users upload into their own folder" on storage.objects;
drop policy if exists "Owners and active recipients can read secure files" on storage.objects;
drop policy if exists "Owners can update objects in their own folder" on storage.objects;
drop policy if exists "Owners can delete objects in their own folder" on storage.objects;

create policy "Users upload into their own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'secure-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Owners and active recipients can read secure files"
on storage.objects for select to authenticated
using (
  bucket_id = 'secure-files'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1 from public.file_shares s
      where s.storage_path = name
        and lower(s.recipient_email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
        and s.revoked = false
        and s.expires_at > now()
    )
  )
);

create policy "Owners can update objects in their own folder"
on storage.objects for update to authenticated
using (bucket_id = 'secure-files' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'secure-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Owners can delete objects in their own folder"
on storage.objects for delete to authenticated
using (bucket_id = 'secure-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Quick verification after running:
-- select id, name, public, file_size_limit from storage.buckets where id = 'secure-files';
-- select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename in ('files','file_shares');
