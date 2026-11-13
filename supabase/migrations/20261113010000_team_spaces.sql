-- Team spaces.
--
-- Every row becomes either personal (workspace_id is null: it belongs to owner_id) or a team's
-- (workspace_id = the Clerk organization id: it belongs to everyone currently in that team).
-- The team a request acts for comes from the Clerk session token, which only names an
-- organization the person is a member of.
--
-- Safe to run while the site is live: existing rows keep workspace_id null, which is exactly
-- "personal", and the app version from before this migration only ever reads and writes those.
-- It runs as one transaction, so there is no moment without access rules in place.

begin;

-- The organization in the caller's Clerk session token, or null when they are working personally.
-- (Clerk puts it in "o.id" in current tokens and in "org_id" in older ones.)
create or replace function public.clerk_org_id() returns text
  language sql stable
  as $$ select coalesce(auth.jwt() ->> 'org_id', auth.jwt() -> 'o' ->> 'id') $$;

-- The one ownership rule, used by every policy below.
create or replace function public.row_in_scope(owner text, workspace text) returns boolean
  language sql stable
  as $$
    select case
      when workspace is null then owner = (auth.jwt() ->> 'sub')
      else workspace = public.clerk_org_id()
    end
  $$;

-- A new row must be created by the caller, and for the Library they are currently in.
create or replace function public.row_is_mine_to_create(owner text, workspace text) returns boolean
  language sql stable
  as $$ select owner = (auth.jwt() ->> 'sub') and (workspace is null or workspace = public.clerk_org_id()) $$;

-- ---------------------------------------------------------------- emails
alter table public.emails add column workspace_id text check (workspace_id is null or char_length(workspace_id) between 1 and 80);
create index emails_workspace_updated_idx on public.emails (workspace_id, updated_at desc) where workspace_id is not null;

drop policy if exists "emails: owner can read" on public.emails;
drop policy if exists "emails: owner can insert" on public.emails;
drop policy if exists "emails: owner can update" on public.emails;
drop policy if exists "emails: owner can delete" on public.emails;

create policy "emails: read in scope" on public.emails
  for select to authenticated using (public.row_in_scope(owner_id, workspace_id));
create policy "emails: insert in scope" on public.emails
  for insert to authenticated with check (public.row_is_mine_to_create(owner_id, workspace_id));
create policy "emails: update in scope" on public.emails
  for update to authenticated
  using (public.row_in_scope(owner_id, workspace_id))
  with check (public.row_in_scope(owner_id, workspace_id));
create policy "emails: delete in scope" on public.emails
  for delete to authenticated using (public.row_in_scope(owner_id, workspace_id));

-- ---------------------------------------------------------------- assets
alter table public.assets add column workspace_id text check (workspace_id is null or char_length(workspace_id) between 1 and 80);
create index assets_workspace_idx on public.assets (workspace_id) where workspace_id is not null;

-- The stored file lives under the team's folder for team images, the owner's for personal ones.
alter table public.assets drop constraint assets_path_owner;
alter table public.assets add constraint assets_path_owner check (split_part(storage_path, '/', 1) = coalesce(workspace_id, owner_id));

drop policy if exists "assets: owner can read" on public.assets;
drop policy if exists "assets: owner can insert" on public.assets;
drop policy if exists "assets: owner can delete" on public.assets;

create policy "assets: read in scope" on public.assets
  for select to authenticated using (public.row_in_scope(owner_id, workspace_id));
create policy "assets: insert in scope" on public.assets
  for insert to authenticated with check (public.row_is_mine_to_create(owner_id, workspace_id));
create policy "assets: delete in scope" on public.assets
  for delete to authenticated using (public.row_in_scope(owner_id, workspace_id));
-- still no update policy: assets are immutable

-- ---------------------------------------------------------------- storage
drop policy if exists "email-assets: owner can read" on storage.objects;
drop policy if exists "email-assets: owner can upload" on storage.objects;
drop policy if exists "email-assets: owner can delete" on storage.objects;

-- A file's first folder is a person's id or a team's id (they never collide: "user_..." and "org_...").
create policy "email-assets: read own or team folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'email-assets' and (storage.foldername(name))[1] in ((auth.jwt() ->> 'sub'), public.clerk_org_id()));
create policy "email-assets: upload to own or team folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'email-assets' and (storage.foldername(name))[1] in ((auth.jwt() ->> 'sub'), public.clerk_org_id()));
create policy "email-assets: delete from own or team folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'email-assets' and (storage.foldername(name))[1] in ((auth.jwt() ->> 'sub'), public.clerk_org_id()));

-- ---------------------------------------------------------------- saved_modules
alter table public.saved_modules add column workspace_id text check (workspace_id is null or char_length(workspace_id) between 1 and 80);
create index saved_modules_workspace_idx on public.saved_modules (workspace_id, created_at desc) where workspace_id is not null;

drop policy if exists "saved_modules: owner can read" on public.saved_modules;
drop policy if exists "saved_modules: owner can insert" on public.saved_modules;
drop policy if exists "saved_modules: owner can delete" on public.saved_modules;

create policy "saved_modules: read in scope" on public.saved_modules
  for select to authenticated using (public.row_in_scope(owner_id, workspace_id));
create policy "saved_modules: insert in scope" on public.saved_modules
  for insert to authenticated with check (public.row_is_mine_to_create(owner_id, workspace_id));
create policy "saved_modules: delete in scope" on public.saved_modules
  for delete to authenticated using (public.row_in_scope(owner_id, workspace_id));

-- ---------------------------------------------------------------- templates
alter table public.templates add column workspace_id text check (workspace_id is null or char_length(workspace_id) between 1 and 80);
create index templates_workspace_idx on public.templates (workspace_id, created_at desc) where workspace_id is not null;

drop policy if exists "templates: owner can read" on public.templates;
drop policy if exists "templates: owner can insert" on public.templates;
drop policy if exists "templates: owner can delete" on public.templates;

create policy "templates: read in scope" on public.templates
  for select to authenticated using (public.row_in_scope(owner_id, workspace_id));
create policy "templates: insert in scope" on public.templates
  for insert to authenticated with check (public.row_is_mine_to_create(owner_id, workspace_id));
create policy "templates: delete in scope" on public.templates
  for delete to authenticated using (public.row_in_scope(owner_id, workspace_id));

-- ---------------------------------------------------------------- starter templates a Library has removed
-- Replaces hidden_default_templates, which could only record this per person. The old table is
-- left in place (the app version from before this migration still uses it) and its rows are copied.
create table public.hidden_starter_templates (
  id           uuid primary key default gen_random_uuid(),
  owner_id     text not null default (auth.jwt() ->> 'sub'),
  workspace_id text check (workspace_id is null or char_length(workspace_id) between 1 and 80),
  default_id   text not null check (char_length(default_id) between 1 and 80)
);
-- One row per person, per Library, per starter template.
create unique index hidden_starter_templates_once on public.hidden_starter_templates (owner_id, default_id, coalesce(workspace_id, ''));
create index hidden_starter_templates_workspace_idx on public.hidden_starter_templates (workspace_id) where workspace_id is not null;

insert into public.hidden_starter_templates (owner_id, default_id)
  select owner_id, default_id from public.hidden_default_templates;

alter table public.hidden_starter_templates enable row level security;

create policy "hidden_starter_templates: read in scope" on public.hidden_starter_templates
  for select to authenticated using (public.row_in_scope(owner_id, workspace_id));
create policy "hidden_starter_templates: insert in scope" on public.hidden_starter_templates
  for insert to authenticated with check (public.row_is_mine_to_create(owner_id, workspace_id));
create policy "hidden_starter_templates: delete in scope" on public.hidden_starter_templates
  for delete to authenticated using (public.row_in_scope(owner_id, workspace_id));

-- ---------------------------------------------------------------- who has a team email open
-- So a team member opening an email can be told a colleague is already editing it. Team spaces only.
create table public.email_presence (
  email_id     uuid not null references public.emails (id) on delete cascade,
  user_id      text not null default (auth.jwt() ->> 'sub'),
  workspace_id text not null check (char_length(workspace_id) between 1 and 80),
  user_name    text not null check (char_length(user_name) between 1 and 80),
  seen_at      timestamptz not null default now(),
  primary key (email_id, user_id)
);

alter table public.email_presence enable row level security;

create policy "email_presence: team can read" on public.email_presence
  for select to authenticated using (workspace_id = public.clerk_org_id());
create policy "email_presence: insert own" on public.email_presence
  for insert to authenticated with check (user_id = (auth.jwt() ->> 'sub') and workspace_id = public.clerk_org_id());
create policy "email_presence: update own" on public.email_presence
  for update to authenticated
  using (user_id = (auth.jwt() ->> 'sub') and workspace_id = public.clerk_org_id())
  with check (user_id = (auth.jwt() ->> 'sub') and workspace_id = public.clerk_org_id());
create policy "email_presence: delete own" on public.email_presence
  for delete to authenticated using (user_id = (auth.jwt() ->> 'sub'));

commit;
