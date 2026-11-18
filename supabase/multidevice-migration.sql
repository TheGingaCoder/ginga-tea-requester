-- Ginga Tea Requester: shared multi-device backend migration
-- Run this entire file in Supabase SQL Editor.
-- Create an Auth user first, then add that user's UUID to tea_admins (instructions below).

create extension if not exists pgcrypto;

alter table public.tea_settings
  add column if not exists cooldown_seconds integer not null default 15
    check (cooldown_seconds between 1 and 86400),
  add column if not exists allowance_reset_at timestamptz,
  add column if not exists hours_override boolean not null default false;

create table if not exists public.tea_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.tea_requests (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'Pending' check (status in ('Pending', 'Fulfilled')),
  created_at timestamptz not null default now(),
  fulfilled_at timestamptz
);

create index if not exists tea_requests_created_at_idx on public.tea_requests (created_at desc);
create index if not exists tea_requests_status_idx on public.tea_requests (status);

alter table public.tea_settings enable row level security;
alter table public.tea_admins enable row level security;
alter table public.tea_requests enable row level security;

drop policy if exists "Public can read tea settings" on public.tea_settings;
create policy "Public can read tea settings"
  on public.tea_settings for select to anon, authenticated using (true);

drop policy if exists "Admins can update tea settings" on public.tea_settings;
create policy "Admins can update tea settings"
  on public.tea_settings for update to authenticated
  using (exists (select 1 from public.tea_admins a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.tea_admins a where a.user_id = (select auth.uid())));

drop policy if exists "Admins can read admin list" on public.tea_admins;
create policy "Admins can read admin list"
  on public.tea_admins for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Public can read request status" on public.tea_requests;
create policy "Public can read request status"
  on public.tea_requests for select to anon, authenticated using (true);

drop policy if exists "Admins can update requests" on public.tea_requests;
create policy "Admins can update requests"
  on public.tea_requests for update to authenticated
  using (exists (select 1 from public.tea_admins a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.tea_admins a where a.user_id = (select auth.uid())));

create or replace function public.submit_tea_request()
returns public.tea_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.tea_settings%rowtype;
  v_now timestamptz := now();
  v_local timestamp := v_now at time zone 'Europe/London';
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_count integer;
  v_latest public.tea_requests%rowtype;
  v_result public.tea_requests%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('ginga-tea-request'));

  select * into v_settings from public.tea_settings where id = 1;
  if not found then raise exception 'Tea system is not configured'; end if;
  if not v_settings.requests_enabled then raise exception 'Requests are disabled'; end if;

  if not v_settings.hours_override then
    if v_settings.opens_at < v_settings.closes_at then
      if v_local::time < v_settings.opens_at or v_local::time >= v_settings.closes_at then
        raise exception 'Requests are outside opening hours';
      end if;
    else
      if v_local::time >= v_settings.closes_at and v_local::time < v_settings.opens_at then
        raise exception 'Requests are outside opening hours';
      end if;
    end if;
  end if;

  v_day_start := date_trunc('day', v_local) at time zone 'Europe/London';
  v_day_end := (date_trunc('day', v_local) + interval '1 day') at time zone 'Europe/London';

  select count(*) into v_count
  from public.tea_requests
  where created_at >= greatest(v_day_start, coalesce(v_settings.allowance_reset_at, v_day_start))
    and created_at < v_day_end;

  if v_count >= v_settings.daily_limit then
    raise exception 'Daily tea limit reached';
  end if;

  select * into v_latest
  from public.tea_requests
  order by created_at desc
  limit 1;

  if found then
    if v_latest.status = 'Pending' then
      raise exception 'A tea request is still awaiting fulfilment';
    end if;
    if v_latest.fulfilled_at is not null
      and v_now < v_latest.fulfilled_at + make_interval(secs => v_settings.cooldown_seconds) then
      raise exception 'Tea cooldown is active';
    end if;
  end if;

  insert into public.tea_requests default values returning * into v_result;
  return v_result;
end;
$$;

revoke all on function public.submit_tea_request() from public;
grant execute on function public.submit_tea_request() to anon, authenticated;

create or replace function public.fulfil_tea_request(p_request_id uuid)
returns public.tea_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result public.tea_requests%rowtype;
begin
  if not exists (select 1 from public.tea_admins a where a.user_id = (select auth.uid())) then
    raise exception 'Administrator access required';
  end if;

  update public.tea_requests
  set status = 'Fulfilled', fulfilled_at = now()
  where id = p_request_id and status = 'Pending'
  returning * into v_result;

  if not found then raise exception 'Pending request not found'; end if;
  return v_result;
end;
$$;

revoke all on function public.fulfil_tea_request(uuid) from public;
grant execute on function public.fulfil_tea_request(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tea_settings'
  ) then
    alter publication supabase_realtime add table public.tea_settings;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tea_requests'
  ) then
    alter publication supabase_realtime add table public.tea_requests;
  end if;
end $$;

-- ADMIN SETUP:
-- 1. Create your user in Supabase Dashboard > Authentication > Users.
-- 2. Replace the email below and run:
-- insert into public.tea_admins (user_id)
-- select id from auth.users where email = 'YOUR-ADMIN-EMAIL';
