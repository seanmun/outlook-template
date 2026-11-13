-- Templates: emails a user saved to start new emails from, plus a record of which of the
-- built-in starter templates they have removed. Same auth model as the other tables:
-- auth.jwt()->>'sub' is the Clerk user id, and every row is owner-scoped by RLS.

create table public.templates (
  id         uuid primary key default gen_random_uuid(),
  owner_id   text not null default (auth.jwt() ->> 'sub'),
  name       text not null check (char_length(name) between 1 and 80),
  document   jsonb not null check (jsonb_typeof(document) = 'object' and pg_column_size(document) < 2000000),
  created_at timestamptz not null default now()
);
create index templates_owner_idx on public.templates (owner_id, created_at desc);

alter table public.templates enable row level security;

create policy "templates: owner can read" on public.templates
  for select to authenticated using (owner_id = (auth.jwt() ->> 'sub'));
create policy "templates: owner can insert" on public.templates
  for insert to authenticated with check (owner_id = (auth.jwt() ->> 'sub'));
create policy "templates: owner can delete" on public.templates
  for delete to authenticated using (owner_id = (auth.jwt() ->> 'sub'));

create table public.hidden_default_templates (
  owner_id   text not null default (auth.jwt() ->> 'sub'),
  default_id text not null check (char_length(default_id) between 1 and 80),
  primary key (owner_id, default_id)
);

alter table public.hidden_default_templates enable row level security;

create policy "hidden_default_templates: owner can read" on public.hidden_default_templates
  for select to authenticated using (owner_id = (auth.jwt() ->> 'sub'));
create policy "hidden_default_templates: owner can insert" on public.hidden_default_templates
  for insert to authenticated with check (owner_id = (auth.jwt() ->> 'sub'));
create policy "hidden_default_templates: owner can delete" on public.hidden_default_templates
  for delete to authenticated using (owner_id = (auth.jwt() ->> 'sub'));
