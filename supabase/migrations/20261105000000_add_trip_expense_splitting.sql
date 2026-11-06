create table public.trip_members (
  trip_id uuid not null references public.trip_plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null default 'Trip member' check (char_length(display_name) between 1 and 80),
  upi_id text check (
    upi_id is null or (
      char_length(upi_id) <= 100
      and upi_id ~* '^[a-z0-9._+-]{2,100}@[a-z0-9.-]{2,50}$'
    )
  ),
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

insert into public.trip_members (trip_id, user_id)
select id, user_id from public.trip_plans
on conflict do nothing;

create function public.add_trip_owner_as_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.trip_members (trip_id, user_id, display_name)
  values (
    new.id,
    new.user_id,
    coalesce(
      nullif(left(btrim((select auth.jwt() ->> 'name')), 80), ''),
      nullif(left(split_part((select auth.jwt() ->> 'email'), '@', 1), 80), ''),
      'Trip member'
    )
  )
  on conflict (trip_id, user_id) do nothing;
  return new;
end;
$$;

create trigger trip_plans_add_owner_as_member
after insert on public.trip_plans
for each row execute function public.add_trip_owner_as_member();

create table public.trip_expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trip_plans(id) on delete cascade,
  description text not null check (char_length(description) between 1 and 160),
  amount_paise bigint not null check (amount_paise between 1 and 9007199254740991),
  paid_by uuid not null,
  created_by uuid not null default auth.uid(),
  split_type text not null check (split_type in ('equal', 'custom')),
  created_at timestamptz not null default now(),
  unique (id, trip_id),
  foreign key (trip_id, paid_by) references public.trip_members(trip_id, user_id) on delete cascade,
  foreign key (trip_id, created_by) references public.trip_members(trip_id, user_id) on delete cascade
);

create index trip_expenses_trip_created_at_idx on public.trip_expenses (trip_id, created_at desc);
alter table public.trip_expenses replica identity full;

create table public.trip_expense_splits (
  trip_id uuid not null,
  expense_id uuid not null,
  user_id uuid not null,
  amount_paise bigint not null check (amount_paise between 0 and 9007199254740991),
  primary key (expense_id, user_id),
  foreign key (expense_id, trip_id) references public.trip_expenses(id, trip_id) on delete cascade,
  foreign key (trip_id, user_id) references public.trip_members(trip_id, user_id) on delete cascade
);

create index trip_expense_splits_trip_idx on public.trip_expense_splits (trip_id);

create table public.trip_invites (
  trip_id uuid primary key references public.trip_plans(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  foreign key (trip_id, created_by) references public.trip_members(trip_id, user_id) on delete cascade
);

create function public.is_trip_member(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.trip_members as member
    where member.trip_id = p_trip_id
      and member.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_trip_member(uuid) from public;
grant execute on function public.is_trip_member(uuid) to authenticated;

alter table public.trip_members enable row level security;
alter table public.trip_expenses enable row level security;
alter table public.trip_expense_splits enable row level security;
alter table public.trip_invites enable row level security;

revoke all on public.trip_members, public.trip_expenses, public.trip_expense_splits, public.trip_invites from public, anon, authenticated;
grant select on public.trip_members, public.trip_expenses, public.trip_expense_splits to authenticated;
grant update (upi_id) on public.trip_members to authenticated;
grant delete on public.trip_expenses to authenticated;

create policy "Trip members can read their trip members"
  on public.trip_members for select
  to authenticated
  using ((select public.is_trip_member(trip_id)));

create policy "Trip members can update their own UPI ID"
  on public.trip_members for update
  to authenticated
  using (user_id = (select auth.uid()) and (select public.is_trip_member(trip_id)))
  with check (user_id = (select auth.uid()) and (select public.is_trip_member(trip_id)));

create policy "Trip members can read trip expenses"
  on public.trip_expenses for select
  to authenticated
  using ((select public.is_trip_member(trip_id)));

create policy "Expense creators can delete their own expenses"
  on public.trip_expenses for delete
  to authenticated
  using (created_by = (select auth.uid()) and (select public.is_trip_member(trip_id)));

create policy "Trip members can read expense splits"
  on public.trip_expense_splits for select
  to authenticated
  using ((select public.is_trip_member(trip_id)));

create function public.get_trip_split(p_trip_id uuid)
returns table (title text, destination text)
language sql
stable
security definer
set search_path = ''
as $$
  select trip.title, trip.destination
  from public.trip_plans as trip
  where trip.id = p_trip_id
    and (select public.is_trip_member(p_trip_id));
$$;

create function public.create_trip_invite(p_trip_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite_token uuid;
begin
  if (select auth.uid()) is null or not (select public.is_trip_member(p_trip_id)) then
    raise exception 'Only trip members can invite collaborators.';
  end if;

  insert into public.trip_invites (trip_id, token, created_by)
  values (p_trip_id, gen_random_uuid(), (select auth.uid()))
  on conflict (trip_id) do update
    set token = excluded.token, created_by = excluded.created_by, created_at = now()
  returning token into invite_token;

  return invite_token;
end;
$$;

create function public.accept_trip_invite(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invited_trip_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in before joining a trip.';
  end if;

  select invite.trip_id into invited_trip_id
  from public.trip_invites as invite
  where invite.token = p_token
  for update;

  if invited_trip_id is null then
    raise exception 'This invitation is invalid or has been replaced.';
  end if;

  perform 1 from public.trip_plans as trip where trip.id = invited_trip_id for update;
  if not exists (
    select 1 from public.trip_members as member
    where member.trip_id = invited_trip_id and member.user_id = (select auth.uid())
  ) and (
    select count(*) from public.trip_members as member
    where member.trip_id = invited_trip_id
  ) >= 12 then
    raise exception 'This trip already has the maximum of 12 members.';
  end if;

  insert into public.trip_members (trip_id, user_id, display_name)
  values (
    invited_trip_id,
    (select auth.uid()),
    coalesce(
      nullif(left(btrim((select auth.jwt() ->> 'name')), 80), ''),
      nullif(left(split_part((select auth.jwt() ->> 'email'), '@', 1), 80), ''),
      'Trip member'
    )
  )
  on conflict (trip_id, user_id) do nothing;

  return invited_trip_id;
end;
$$;

create function public.create_trip_expense(
  p_trip_id uuid,
  p_description text,
  p_amount_paise bigint,
  p_paid_by uuid,
  p_split_type text,
  p_splits jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  expense_id uuid;
  member_count integer;
begin
  if (select auth.uid()) is null or not (select public.is_trip_member(p_trip_id)) then
    raise exception 'Only trip members can add expenses.';
  end if;
  if p_description is null or char_length(btrim(p_description)) not between 1 and 160 then
    raise exception 'Add a description of 1–160 characters.';
  end if;
  if p_amount_paise not between 1 and 9007199254740991 then
    raise exception 'Enter a positive amount within the supported range.';
  end if;
  if p_split_type is null or p_split_type not in ('equal', 'custom') then
    raise exception 'Choose an equal or custom split.';
  end if;
  if p_splits is null or jsonb_typeof(p_splits) is distinct from 'array' then
    raise exception 'Add one split for every trip member.';
  end if;
  if jsonb_array_length(p_splits) not between 1 and 12 then
    raise exception 'Add one split for every trip member.';
  end if;
  if not exists (
    select 1 from public.trip_members as member
    where member.trip_id = p_trip_id and member.user_id = p_paid_by
  ) then
    raise exception 'Choose a member who belongs to this trip as the payer.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_splits) as entry(value)
    where jsonb_typeof(entry.value -> 'user_id') is distinct from 'string'
      or (entry.value ->> 'user_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(entry.value -> 'amount_paise') is distinct from 'number'
      or (entry.value ->> 'amount_paise') !~ '^(0|[1-9][0-9]*)$'
      or length(entry.value ->> 'amount_paise') > 16
      or (
        length(entry.value ->> 'amount_paise') = 16
        and (entry.value ->> 'amount_paise') > '9007199254740991'
      )
  ) then
    raise exception 'Every expense share must have a valid member ID and whole paise amount.';
  end if;

  select count(*) into member_count
  from public.trip_members as member
  where member.trip_id = p_trip_id;
  if jsonb_array_length(p_splits) <> member_count then
    raise exception 'Add one split for every trip member.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_splits) as split(user_id uuid, amount_paise bigint)
    where split.user_id is null
      or split.amount_paise not between 0 and 9007199254740991
  ) or (
    select count(distinct split.user_id)
    from jsonb_to_recordset(p_splits) as split(user_id uuid, amount_paise bigint)
  ) <> member_count or exists (
    select 1
    from jsonb_to_recordset(p_splits) as split(user_id uuid, amount_paise bigint)
    where not exists (
      select 1 from public.trip_members as member
      where member.trip_id = p_trip_id and member.user_id = split.user_id
    )
  ) then
    raise exception 'Every trip member must have one valid, non-negative expense share.';
  end if;

  if (
    select sum(split.amount_paise)
    from jsonb_to_recordset(p_splits) as split(user_id uuid, amount_paise bigint)
  ) <> p_amount_paise then
    raise exception 'Expense shares must add up to the expense total.';
  end if;
  if p_split_type = 'equal' and exists (
    select 1
    from (
      select member.user_id, row_number() over (order by member.joined_at, member.user_id) - 1 as member_index
      from public.trip_members as member
      where member.trip_id = p_trip_id
    ) as ordered_members
    join jsonb_to_recordset(p_splits) as split(user_id uuid, amount_paise bigint)
      on split.user_id = ordered_members.user_id
    where split.amount_paise <> p_amount_paise / member_count
      + case when ordered_members.member_index < mod(p_amount_paise, member_count) then 1 else 0 end
  ) then
    raise exception 'Equal shares must distribute leftover paise evenly across trip members.';
  end if;

  insert into public.trip_expenses (trip_id, description, amount_paise, paid_by, created_by, split_type)
  values (p_trip_id, btrim(p_description), p_amount_paise, p_paid_by, (select auth.uid()), p_split_type)
  returning id into expense_id;

  insert into public.trip_expense_splits (trip_id, expense_id, user_id, amount_paise)
  select p_trip_id, expense_id, split.user_id, split.amount_paise
  from jsonb_to_recordset(p_splits) as split(user_id uuid, amount_paise bigint);

  return expense_id;
end;
$$;

revoke all on function public.get_trip_split(uuid) from public;
revoke all on function public.create_trip_invite(uuid) from public;
revoke all on function public.accept_trip_invite(uuid) from public;
revoke all on function public.create_trip_expense(uuid, text, bigint, uuid, text, jsonb) from public;
grant execute on function public.get_trip_split(uuid) to authenticated;
grant execute on function public.create_trip_invite(uuid) to authenticated;
grant execute on function public.accept_trip_invite(uuid) to authenticated;
grant execute on function public.create_trip_expense(uuid, text, bigint, uuid, text, jsonb) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.trip_members, public.trip_expenses, public.trip_expense_splits';
  end if;
end;
$$;
