create table if not exists public.trip_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  destination text not null check (char_length(destination) between 1 and 200),
  prompt text not null check (char_length(prompt) between 1 and 1200),
  itinerary jsonb not null check (jsonb_typeof(itinerary) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists trip_plans_user_created_at_idx
  on public.trip_plans (user_id, created_at desc);

alter table public.trip_plans enable row level security;

revoke all on public.trip_plans from anon;
grant select, insert, delete on public.trip_plans to authenticated;

create policy "Users can read their own trip plans"
  on public.trip_plans for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can save their own trip plans"
  on public.trip_plans for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own trip plans"
  on public.trip_plans for delete
  to authenticated
  using ((select auth.uid()) = user_id);
