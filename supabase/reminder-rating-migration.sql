-- Ginga Tea Requester: reminder and tea quality rating
-- Run once in the Supabase SQL Editor after the existing migrations.

alter table public.tea_requests
  add column if not exists reminder_sent_at timestamptz,
  add column if not exists tea_rating smallint check (tea_rating between 1 and 5);

create or replace function public.submit_tea_rating(p_request_id uuid, p_rating integer)
returns public.tea_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result public.tea_requests%rowtype;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5';
  end if;
  update public.tea_requests
  set tea_rating = p_rating
  where id = p_request_id and status = 'Fulfilled' and tea_rating is null
  returning * into v_result;
  if not found then
    raise exception 'This fulfilled request has already been rated or cannot be rated';
  end if;
  return v_result;
end;
$$;

revoke all on function public.submit_tea_rating(uuid, integer) from public;
grant execute on function public.submit_tea_rating(uuid, integer) to anon, authenticated;
