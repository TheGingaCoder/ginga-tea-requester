-- Tighten GingaHelp administrator helpers and device subscriptions.
-- Keep the SECURITY DEFINER helper out of the exposed public API schema.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.is_gingahelp_admin()
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
revoke all on function private.is_gingahelp_admin() from public, anon;
grant execute on function private.is_gingahelp_admin() to authenticated;

drop policy if exists gingahelp_status_admin_update on public.gingahelp_status;
create policy gingahelp_status_admin_update
  on public.gingahelp_status for update
  to authenticated
  using (private.is_gingahelp_admin())
  with check (private.is_gingahelp_admin());

drop policy if exists gingahelp_devices_read_own on public.gingahelp_devices;
create policy gingahelp_devices_read_own on public.gingahelp_devices
  for select to authenticated
  using (user_id = (select auth.uid()) and private.is_gingahelp_admin());

drop policy if exists gingahelp_devices_insert_own on public.gingahelp_devices;
create policy gingahelp_devices_insert_own on public.gingahelp_devices
  for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_gingahelp_admin());

drop policy if exists gingahelp_devices_update_own on public.gingahelp_devices;
create policy gingahelp_devices_update_own on public.gingahelp_devices
  for update to authenticated
  using (user_id = (select auth.uid()) and private.is_gingahelp_admin())
  with check (user_id = (select auth.uid()) and private.is_gingahelp_admin());

drop policy if exists gingahelp_devices_delete_own on public.gingahelp_devices;
create policy gingahelp_devices_delete_own on public.gingahelp_devices
  for delete to authenticated
  using (user_id = (select auth.uid()) and private.is_gingahelp_admin());

drop policy if exists gingahelp_rate_limits_deny_clients on public.gingahelp_rate_limits;
create policy gingahelp_rate_limits_deny_clients
  on public.gingahelp_rate_limits for all
  to anon, authenticated using (false) with check (false);

create index if not exists gingahelp_devices_user_id_idx
  on public.gingahelp_devices(user_id);
create index if not exists gingahelp_status_updated_by_idx
  on public.gingahelp_status(updated_by);

drop function if exists public.is_gingahelp_admin();
