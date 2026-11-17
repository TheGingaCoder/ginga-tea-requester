-- Ginga Tea Requester: opening-hours override migration
-- Run this once in the Supabase SQL Editor for an existing project.
alter table public.tea_settings
  add column if not exists hours_override boolean not null default false;

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

  v_today_start := date_trunc('day', v_local) at time zone 'Europe/London';
  select count(*) into v_today_count from public.tea_requests
    where created_at >= v_today_start and created_at < (v_today_start + interval '1 day');
  if v_today_count >= v_settings.daily_limit then raise exception 'Daily tea limit reached'; end if;

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
