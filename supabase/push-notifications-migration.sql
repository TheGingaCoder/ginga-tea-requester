-- Ginga Tea Requester: Web Push notification storage
-- Run after the multi-device migration.

alter table public.tea_requests
  add column if not exists notification_sent_at timestamptz;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
grant select, insert, delete on public.push_subscriptions to authenticated;

drop policy if exists "Admins can read their push subscriptions" on public.push_subscriptions;
create policy "Admins can read their push subscriptions"
  on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()) and exists (
    select 1 from public.tea_admins a where a.user_id = (select auth.uid())
  ));

drop policy if exists "Admins can register their push subscriptions" on public.push_subscriptions;
create policy "Admins can register their push subscriptions"
  on public.push_subscriptions for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.tea_admins a where a.user_id = (select auth.uid())
  ));

drop policy if exists "Admins can remove their push subscriptions" on public.push_subscriptions;
create policy "Admins can remove their push subscriptions"
  on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()) and exists (
    select 1 from public.tea_admins a where a.user_id = (select auth.uid())
  ));