-- Ginga Tea Requester: shared backend schema
-- Run this entire file in Supabase SQL Editor.
-- Admin accounts are added after creating their Supabase Auth user.

create extension if not exists pgcrypto;

create table if not exists public.tea_settings (
  id integer primary key default 1 check (id = 1),
  opens_at time not null default time '07:00',
  closes_at time not null default time '22:00',
  cooldown_minutes integer not null default 60 check (cooldown_minutes between 1 and 1440),
  daily_limit integer not null default 4 check (daily_limit between 1 and 100),
  requests_enabled boolean not null default true,
  hours_override boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.tea_settings (id) values (1) on conflict (id) do nothing;

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

-- Only admins can directly change request status.
drop policy if exists "Admins can update requests" on public.tea_requests;
create policy "Admins can update requests"
  on public.tea_requests for update to authenticated
  using (exists (select 1 from public.tea_admins a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.tea_admins a where a.user_id = (select auth.uid())));

-- Request creation is performed through this database function so the rules
-- are checked centrally and concurrent requests cannot bypass the limits.
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
  v_today_start timestamptz;
  v_today_count integer;
  v_latest timestamptz;
  v_result public.tea_requests%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('ginga-tea-request'));

  select * into v_settings from public.tea_settings where id = 1;
  if not found then raise exception 'Tea system is not configured'; end if;

  if not v_settings.requests_enabled then raise exception 'Requests are disabled'; end if;

  if not v_settings.hours_override and v_settings.opens_at < v_settings.closes_at then
    if v_local::time < v_settings.opens_at or v_local::time >= v_settings.closes_at then
      raise exception 'Requests are outside opening hours';
    end if;
  elsif not v_settings.hours_override then
    if v_local::time >= v_settings.closes_at and v_local::time < v_settings.opens_at then
      raise exception 'Requests are outside opening hours';
    end if;
  end if;

  v_today_start := date_trunc('day', v_local) at time zone 'Europe/London';
  select count(*) into v_today_count
    from public.tea_requests
    where created_at >= v_today_start
      and created_at < (v_today_start + interval '1 day');

  if v_today_count >= v_settings.daily_limit then
    raise exception 'Daily tea limit reached';
  end if;

  select max(created_at) into v_latest from public.tea_requests;
  if v_latest is not null and v_now < v_latest + make_interval(mins => v_settings.cooldown_minutes) then
    raise exception 'Tea cooldown is active';
  end if;

  insert into public.tea_requests default values returning * into v_result;
  return v_result;
end;
$$;

revoke all on function public.submit_tea_request() from public;
grant execute on function public.submit_tea_request() to anon, authenticated;

-- Admin-only helper for changing a request to Fulfilled.
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

-- Realtime publishes updates to connected browser instances.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tea_settings'
  ) then
    alter publication supabase_realtime add table public.tea_settings;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tea_requests'
  ) then
    alter publication supabase_realtime add table public.tea_requests;
  end if;
end $$;
