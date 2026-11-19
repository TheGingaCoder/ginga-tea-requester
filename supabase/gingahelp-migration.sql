-- GingaHelp's independent status, administrator, device and rate-limit data.
-- The legacy Tea Requester schema is intentionally left unchanged.

create table if not exists public.gingahelp_status (
  id smallint primary key default 1 check (id = 1),
  status text not null default 'active'
    check (status in ('active', 'sleep', 'college', 'away')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.gingahelp_status (id, status)
values (1, 'active')
on conflict (id) do nothing;

create table if not exists public.gingahelp_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);

-- Carry forward only the existing administrator identity, not Tea tables/data.
insert into public.gingahelp_admins (user_id)
select user_id from public.tea_admins
on conflict (user_id) do nothing;

create or replace function public.is_gingahelp_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.gingahelp_admins
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_gingahelp_admin() from public, anon;
grant execute on function public.is_gingahelp_admin() to authenticated;

alter table public.gingahelp_status enable row level security;
alter table public.gingahelp_admins enable row level security;

grant select on public.gingahelp_status to anon, authenticated;
grant update (status, updated_at, updated_by) on public.gingahelp_status to authenticated;
grant select on public.gingahelp_admins to authenticated;

drop policy if exists gingahelp_status_read on public.gingahelp_status;
create policy gingahelp_status_read
  on public.gingahelp_status for select
  to anon, authenticated using (true);

drop policy if exists gingahelp_status_admin_update on public.gingahelp_status;
create policy gingahelp_status_admin_update
  on public.gingahelp_status for update
  to authenticated
  using (public.is_gingahelp_admin())
  with check (public.is_gingahelp_admin());

drop policy if exists gingahelp_admins_read_self on public.gingahelp_admins;
create policy gingahelp_admins_read_self
  on public.gingahelp_admins for select
  to authenticated
  using (user_id = (select auth.uid()));

create table if not exists public.gingahelp_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.gingahelp_devices enable row level security;
grant select, insert, update, delete on public.gingahelp_devices to authenticated;

drop policy if exists gingahelp_devices_read_own on public.gingahelp_devices;
create policy gingahelp_devices_read_own on public.gingahelp_devices
  for select to authenticated
  using (user_id = (select auth.uid()) and public.is_gingahelp_admin());

drop policy if exists gingahelp_devices_insert_own on public.gingahelp_devices;
create policy gingahelp_devices_insert_own on public.gingahelp_devices
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_gingahelp_admin());

drop policy if exists gingahelp_devices_update_own on public.gingahelp_devices;
create policy gingahelp_devices_update_own on public.gingahelp_devices
  for update to authenticated
  using (user_id = (select auth.uid()) and public.is_gingahelp_admin())
  with check (user_id = (select auth.uid()) and public.is_gingahelp_admin());

drop policy if exists gingahelp_devices_delete_own on public.gingahelp_devices;
create policy gingahelp_devices_delete_own on public.gingahelp_devices
  for delete to authenticated
  using (user_id = (select auth.uid()) and public.is_gingahelp_admin());

create table if not exists public.gingahelp_rate_limits (
  fingerprint text primary key,
  last_request_at timestamptz not null default now()
);
alter table public.gingahelp_rate_limits enable row level security;

create or replace function public.claim_gingahelp_request(p_fingerprint text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed boolean := false;
begin
  insert into public.gingahelp_rate_limits (fingerprint, last_request_at)
  values (p_fingerprint, now())
  on conflict (fingerprint)
  do update set last_request_at = excluded.last_request_at
    where public.gingahelp_rate_limits.last_request_at < now() - interval '3 seconds'
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

revoke all on function public.claim_gingahelp_request(text) from public, anon, authenticated;
grant execute on function public.claim_gingahelp_request(text) to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'gingahelp_status'
     ) then
    execute 'alter publication supabase_realtime add table public.gingahelp_status';
  end if;
end
$$;
