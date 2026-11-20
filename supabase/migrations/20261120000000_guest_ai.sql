-- AI for visitors without an account, with ceilings so it cannot run up the bill.
--
-- Three counts per day: one per browser, one per network address, and one for all guests together.
-- A request is only counted when all three still have room. Nobody can read or write the table
-- directly; the only way in is the function below, which can only ever add one.
--
-- The browser and network keys are scrambled by the site before they get here, and rows from
-- earlier days are deleted as soon as a new day's first request arrives.

begin;

create table public.guest_ai_usage (
  day   date not null default ((now() at time zone 'utc')::date),
  kind  text not null check (kind in ('browser', 'network', 'all')),
  key   text not null check (char_length(key) between 1 and 100),
  count integer not null default 0 check (count >= 0),
  primary key (day, kind, key)
);

alter table public.guest_ai_usage enable row level security;
-- No policies at all: only use_guest_ai_request() touches this table.

-- Uses up one of today's guest AI requests.
-- Returns how many are left for all guests afterwards (0 means that was the last one today), or
--   -1 this browser has used its share, -2 this network has, -3 all guests together have, -4 bad input.
-- Nothing is used up when the answer is negative.
create or replace function public.use_guest_ai_request(browser_key text, network_key text, browser_limit integer, network_limit integer, total_limit integer) returns integer
  language plpgsql
  security definer
  set search_path = ''
  as $$
  declare
    today date := (now() at time zone 'utc')::date;
    b integer;
    n integer;
    t integer;
  begin
    if browser_key is null or network_key is null or char_length(browser_key) not between 1 and 100 or char_length(network_key) not between 1 and 100
       or browser_limit is null or network_limit is null or total_limit is null or browser_limit < 1 or network_limit < 1 or total_limit < 1 then
      return -4;
    end if;
    -- One guest request at a time, so two arriving together cannot both take the last place.
    perform pg_advisory_xact_lock(826140511);
    delete from public.guest_ai_usage where day < today;
    select coalesce(max(count) filter (where kind = 'browser' and key = browser_key), 0),
           coalesce(max(count) filter (where kind = 'network' and key = network_key), 0),
           coalesce(max(count) filter (where kind = 'all'), 0)
      into b, n, t
      from public.guest_ai_usage where day = today;
    if t >= total_limit then return -3; end if;
    if b >= browser_limit then return -1; end if;
    if n >= network_limit then return -2; end if;
    insert into public.guest_ai_usage as u (day, kind, key, count)
      values (today, 'browser', browser_key, 1), (today, 'network', network_key, 1), (today, 'all', 'all', 1)
      on conflict (day, kind, key) do update set count = u.count + 1;
    return total_limit - t - 1;
  end
  $$;

revoke all on function public.use_guest_ai_request(text, text, integer, integer, integer) from public;
grant execute on function public.use_guest_ai_request(text, text, integer, integer, integer) to anon, authenticated;

commit;
