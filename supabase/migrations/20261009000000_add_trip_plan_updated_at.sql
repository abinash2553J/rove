alter table public.trip_plans
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_trip_plans_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trip_plans_set_updated_at on public.trip_plans;
create trigger trip_plans_set_updated_at
before update on public.trip_plans
for each row
execute function public.set_trip_plans_updated_at();
