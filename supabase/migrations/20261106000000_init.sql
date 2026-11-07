-- Outlook Template Builder: initial schema.
--
-- Auth model: Clerk is configured as a Supabase third-party auth provider.
-- Requests carry the user's Clerk session JWT; auth.jwt()->>'sub' is the Clerk
-- user id. Every table is owner-scoped by RLS. The app never uses the
-- service-role key.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- emails
create table public.emails (
  id             uuid primary key default gen_random_uuid(),
  owner_id       text not null default (auth.jwt() ->> 'sub'),
  brand_id       text not null check (char_length(brand_id) between 1 and 60),
  title          text not null default '' check (char_length(title) <= 200),
  subject        text not null default '' check (char_length(subject) <= 300),
  schema_version integer not null check (schema_version >= 1),
  document       jsonb not null check (jsonb_typeof(document) = 'object' and pg_column_size(document) < 2000000),
  revision       integer not null default 1 check (revision >= 1),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index emails_owner_updated_idx on public.emails (owner_id, updated_at desc);

alter table public.emails enable row level security;

create policy "emails: owner can read" on public.emails
  for select to authenticated using (owner_id = (auth.jwt() ->> 'sub'));
create policy "emails: owner can insert" on public.emails
  for insert to authenticated with check (owner_id = (auth.jwt() ->> 'sub'));
create policy "emails: owner can update" on public.emails
  for update to authenticated
  using (owner_id = (auth.jwt() ->> 'sub'))
  with check (owner_id = (auth.jwt() ->> 'sub'));
create policy "emails: owner can delete" on public.emails
  for delete to authenticated using (owner_id = (auth.jwt() ->> 'sub'));

-- ---------------------------------------------------------------- assets
-- Private working images. Exported emails embed the bytes (CID attachments),
-- so no public or signed URL ever leaves the app.
create table public.assets (
  id                uuid primary key default gen_random_uuid(),
  owner_id          text not null default (auth.jwt() ->> 'sub'),
  storage_path      text not null unique,
  mime_type         text not null check (mime_type in ('image/png', 'image/jpeg', 'image/gif')),
  byte_size         integer not null check (byte_size > 0 and byte_size <= 5242880),
  width             integer not null check (width between 1 and 6000),
  height            integer not null check (height between 1 and 6000),
  original_filename text not null default '' check (char_length(original_filename) <= 120),
  created_at        timestamptz not null default now(),
  -- the object must live under the owner's folder
  constraint assets_path_owner check (split_part(storage_path, '/', 1) = owner_id)
);
create index assets_owner_idx on public.assets (owner_id);

alter table public.assets enable row level security;

create policy "assets: owner can read" on public.assets
  for select to authenticated using (owner_id = (auth.jwt() ->> 'sub'));
create policy "assets: owner can insert" on public.assets
  for insert to authenticated with check (owner_id = (auth.jwt() ->> 'sub'));
create policy "assets: owner can delete" on public.assets
  for delete to authenticated using (owner_id = (auth.jwt() ->> 'sub'));
-- no update policy: assets are immutable

-- ---------------------------------------------------------------- storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('email-assets', 'email-assets', false, 5242880, array['image/png', 'image/jpeg', 'image/gif'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "email-assets: owner can read" on storage.objects
  for select to authenticated
  using (bucket_id = 'email-assets' and (storage.foldername(name))[1] = (auth.jwt() ->> 'sub'));
create policy "email-assets: owner can upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'email-assets' and (storage.foldername(name))[1] = (auth.jwt() ->> 'sub'));
create policy "email-assets: owner can delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'email-assets' and (storage.foldername(name))[1] = (auth.jwt() ->> 'sub'));
