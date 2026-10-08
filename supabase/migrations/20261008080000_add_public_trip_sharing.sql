alter table public.trip_plans
  add column share_token text unique;

create or replace function public.get_shared_trip(p_share_token text)
returns table (
  title text,
  destination text,
  itinerary jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select trip.title, trip.destination, trip.itinerary
  from public.trip_plans as trip
  where trip.share_token = p_share_token
  limit 1;
$$;

revoke all on function public.get_shared_trip(text) from public;
grant execute on function public.get_shared_trip(text) to anon, authenticated;
