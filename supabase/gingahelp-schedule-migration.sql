-- GingaHelp automatic status scheduling and college-week exclusions.
-- Apply after gingahelp-migration.sql and gingahelp-security-hardening.sql.

create table if not exists public.gingahelp_college_excluded_weeks (
  week_start date primary key,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint gingahelp_excluded_week_monday check (extract(isodow from week_start) = 1)
);

alter table public.gingahelp_college_excluded_weeks enable row level security;
grant select on public.gingahelp_college_excluded_weeks to anon, authenticated;
grant insert, delete on public.gingahelp_college_excluded_weeks to authenticated;

drop policy if exists gingahelp_college_exclusions_read on public.gingahelp_college_excluded_weeks;
create policy gingahelp_college_exclusions_read on public.gingahelp_college_excluded_weeks
  for select to anon, authenticated using (true);

drop policy if exists gingahelp_college_exclusions_admin_insert on public.gingahelp_college_excluded_weeks;
create policy gingahelp_college_exclusions_admin_insert on public.gingahelp_college_excluded_weeks
  for insert to authenticated
  with check (private.is_gingahelp_admin() and created_by = (select auth.uid()));

drop policy if exists gingahelp_college_exclusions_admin_delete on public.gingahelp_college_excluded_weeks;
create policy gingahelp_college_exclusions_admin_delete on public.gingahelp_college_excluded_weeks
  for delete to authenticated
  using (private.is_gingahelp_admin());

alter table public.gingahelp_status
  add column if not exists manual_override boolean not null default false;

create extension if not exists pg_cron;

create or replace function public.refresh_gingahelp_scheduled_status()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  local_now timestamp;
  local_date date;
  local_time time;
  iso_day integer;
  current_week_start date;
  scheduled_status text;
  override_enabled boolean;
begin
  select manual_override into override_enabled
  from public.gingahelp_status
  where id = 1;

  if coalesce(override_enabled, false) then
    return;
  end if;

  local_now := timezone('Europe/London', now());
  local_date := local_now::date;
  local_time := local_now::time;
  iso_day := extract(isodow from local_date)::integer;
  current_week_start := local_date - (iso_day - 1);

  if local_time < time '07:00' then
    scheduled_status := 'sleep';
  elsif iso_day between 1 and 5
    and local_time >= time '07:30'
    and local_time < time '18:00'
    and not exists (
      select 1 from public.gingahelp_college_excluded_weeks
      where week_start = current_week_start
    ) then
    scheduled_status := 'college';
  else
    scheduled_status := 'active';
  end if;

  update public.gingahelp_status
  set status = scheduled_status,
      updated_at = now(),
      updated_by = null
  where id = 1
    and status is distinct from scheduled_status;
end;
$$;

revoke all on function public.refresh_gingahelp_scheduled_status() from public, anon, authenticated;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'gingahelp-auto-status';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'gingahelp-auto-status',
    '* * * * *',
    'select public.refresh_gingahelp_scheduled_status();'
  );
end
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'gingahelp_college_excluded_weeks'
     ) then
    execute 'alter publication supabase_realtime add table public.gingahelp_college_excluded_weeks';
  end if;
end
$$;

select public.refresh_gingahelp_scheduled_status();
