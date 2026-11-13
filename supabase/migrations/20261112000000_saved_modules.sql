-- Blocks and rows a user saved for reuse, so they follow the account across browsers.
-- Same auth model as the other tables: auth.jwt()->>'sub' is the Clerk user id, and
-- every row is owner-scoped by RLS.

create table public.saved_modules (
  -- Chosen by the browser, so a block saved while offline keeps its id when it syncs.
  id         uuid primary key,
  owner_id   text not null default (auth.jwt() ->> 'sub'),
  name       text not null check (char_length(name) between 1 and 60),
  brand_id   text not null check (char_length(brand_id) between 1 and 60),
  module     jsonb not null check (jsonb_typeof(module) = 'object' and pg_column_size(module) < 500000),
  created_at timestamptz not null default now()
);
create index saved_modules_owner_idx on public.saved_modules (owner_id, created_at desc);

alter table public.saved_modules enable row level security;

create policy "saved_modules: owner can read" on public.saved_modules
  for select to authenticated using (owner_id = (auth.jwt() ->> 'sub'));
create policy "saved_modules: owner can insert" on public.saved_modules
  for insert to authenticated with check (owner_id = (auth.jwt() ->> 'sub'));
create policy "saved_modules: owner can delete" on public.saved_modules
  for delete to authenticated using (owner_id = (auth.jwt() ->> 'sub'));
-- no update policy: a saved module is replaced by saving a new one
