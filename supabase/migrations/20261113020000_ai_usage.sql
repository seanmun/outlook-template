-- A daily limit on AI requests per person, so nobody can run up the bill.
--
-- People can read their own count but cannot write it: the only way a count changes is the
-- function below, which can only ever add one for the caller. So a count cannot be reset or
-- lowered from a browser.

begin;

create table public.ai_usage (
  owner_id text not null,
  day      date not null default ((now() at time zone 'utc')::date),
  count    integer not null default 0 check (count >= 0),
  primary key (owner_id, day)
);

alter table public.ai_usage enable row level security;

create policy "ai_usage: owner can read" on public.ai_usage
  for select to authenticated using (owner_id = (auth.jwt() ->> 'sub'));
-- No insert, update or delete policies: only use_ai_request() writes here.

-- Uses up one of today's AI requests for the caller.
-- Returns how many are left afterwards, or -1 if they had none left (nothing is used up then).
create or replace function public.use_ai_request(daily_limit integer) returns integer
  language plpgsql
  security definer
  set search_path = ''
  as $$
  declare
    me    text := auth.jwt() ->> 'sub';
    today date := (now() at time zone 'utc')::date;
    used  integer;
  begin
    if me is null or daily_limit is null or daily_limit < 1 then
      return -1;
    end if;
    insert into public.ai_usage as u (owner_id, day, count)
      values (me, today, 1)
      on conflict (owner_id, day) do update set count = u.count + 1 where u.count < daily_limit
      returning u.count into used;
    if used is null then
      return -1;
    end if;
    return daily_limit - used;
  end
  $$;

revoke all on function public.use_ai_request(integer) from public, anon;
grant execute on function public.use_ai_request(integer) to authenticated;

commit;
