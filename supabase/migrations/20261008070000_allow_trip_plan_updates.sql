grant update on public.trip_plans to authenticated;

create policy "Users can update their own trip plans"
  on public.trip_plans for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
