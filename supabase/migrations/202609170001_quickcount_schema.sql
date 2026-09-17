create extension if not exists pgcrypto;

create table public.elections (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete cascade,
  candidate_number integer not null check (candidate_number > 0),
  candidate_name text not null check (char_length(trim(candidate_name)) > 0),
  created_at timestamptz not null default now(),
  unique (election_id, candidate_number),
  unique (id, election_id)
);

create table public.tps (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete cascade,
  tps_number integer not null unique check (tps_number > 0),
  name text not null check (char_length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  unique (id, election_id)
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tps_id uuid not null unique references public.tps(id) on delete restrict,
  role text not null default 'witness' check (role in ('witness')),
  created_at timestamptz not null default now()
);

create table public.vote_events (
  id uuid primary key,
  election_id uuid not null references public.elections(id) on delete restrict,
  tps_id uuid not null,
  candidate_id uuid not null,
  user_id uuid not null references auth.users(id) on delete restrict,
  delta smallint not null check (delta in (-1, 1)),
  created_at timestamptz not null default now(),
  client_created_at timestamptz null,
  foreign key (tps_id, election_id) references public.tps(id, election_id) on delete restrict,
  foreign key (candidate_id, election_id) references public.candidates(id, election_id) on delete restrict
);

create index vote_events_tps_created_idx on public.vote_events (tps_id, created_at desc);
create index vote_events_user_idx on public.vote_events (user_id);

create table public.vote_totals (
  election_id uuid not null references public.elections(id) on delete restrict,
  tps_id uuid not null,
  candidate_id uuid not null,
  total integer not null default 0 check (total >= 0),
  updated_at timestamptz not null default now(),
  primary key (election_id, tps_id, candidate_id),
  foreign key (tps_id, election_id) references public.tps(id, election_id) on delete restrict,
  foreign key (candidate_id, election_id) references public.candidates(id, election_id) on delete restrict
);

alter table public.elections enable row level security;
alter table public.candidates enable row level security;
alter table public.tps enable row level security;
alter table public.profiles enable row level security;
alter table public.vote_events enable row level security;
alter table public.vote_totals enable row level security;

create policy "authenticated can read elections"
on public.elections for select to authenticated
using (exists (
  select 1 from public.profiles p where p.user_id = (select auth.uid())
));

create policy "authenticated can read candidates"
on public.candidates for select to authenticated
using (exists (
  select 1 from public.profiles p where p.user_id = (select auth.uid())
));

create policy "authenticated can read tps"
on public.tps for select to authenticated
using (exists (
  select 1 from public.profiles p where p.user_id = (select auth.uid())
));

create policy "users can read own profile"
on public.profiles for select to authenticated
using ((select auth.uid()) = user_id);

create policy "authenticated can read vote totals"
on public.vote_totals for select to authenticated
using (exists (
  select 1 from public.profiles p where p.user_id = (select auth.uid())
));

create policy "users can read own tps events"
on public.vote_events for select to authenticated
using (
  user_id = (select auth.uid())
  and tps_id = (
    select p.tps_id from public.profiles p where p.user_id = (select auth.uid())
  )
);

revoke all on public.elections, public.candidates, public.tps, public.profiles, public.vote_events, public.vote_totals from anon;
revoke insert, update, delete on public.elections, public.candidates, public.tps, public.profiles, public.vote_events, public.vote_totals from authenticated;
grant select on public.elections, public.candidates, public.tps, public.profiles, public.vote_events, public.vote_totals to authenticated;
grant usage on schema public to service_role;
grant all privileges on public.elections, public.candidates, public.tps, public.profiles, public.vote_events, public.vote_totals to service_role;

create or replace function public.submit_vote_event(
  p_event_id uuid,
  p_candidate_id uuid,
  p_delta smallint,
  p_client_created_at timestamptz default null
)
returns table (event_status text, new_total integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_tps_id uuid;
  v_election_id uuid;
  v_total integer;
  v_inserted_id uuid;
  v_existing public.vote_events%rowtype;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if p_event_id is null or p_candidate_id is null or p_delta is null or p_delta not in (-1, 1) then
    raise exception using errcode = '22023', message = 'INVALID_EVENT';
  end if;

  select p.tps_id, t.election_id
    into v_tps_id, v_election_id
  from public.profiles p
  join public.tps t on t.id = p.tps_id
  where p.user_id = v_user_id;

  if v_tps_id is null then
    raise exception using errcode = '42501', message = 'PROFILE_OR_TPS_NOT_FOUND';
  end if;

  if not exists (
    select 1 from public.candidates c
    where c.id = p_candidate_id and c.election_id = v_election_id
  ) then
    raise exception using errcode = '22023', message = 'INVALID_CANDIDATE';
  end if;

  insert into public.vote_events (
    id, election_id, tps_id, candidate_id, user_id, delta, client_created_at
  ) values (
    p_event_id, v_election_id, v_tps_id, p_candidate_id, v_user_id, p_delta, p_client_created_at
  )
  on conflict (id) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is null then
    select * into v_existing from public.vote_events where id = p_event_id;
    if v_existing.user_id is distinct from v_user_id
      or v_existing.tps_id is distinct from v_tps_id
      or v_existing.candidate_id is distinct from p_candidate_id
      or v_existing.delta is distinct from p_delta then
      raise exception using errcode = '22023', message = 'EVENT_ID_PAYLOAD_MISMATCH';
    end if;

    select vt.total into v_total
    from public.vote_totals vt
    where vt.election_id = v_election_id
      and vt.tps_id = v_tps_id
      and vt.candidate_id = p_candidate_id;
    return query select 'duplicate'::text, v_total;
    return;
  end if;

  update public.vote_totals vt
  set total = vt.total + p_delta,
      updated_at = now()
  where vt.election_id = v_election_id
    and vt.tps_id = v_tps_id
    and vt.candidate_id = p_candidate_id
    and vt.total + p_delta >= 0
  returning vt.total into v_total;

  if v_total is null then
    if not exists (
      select 1 from public.vote_totals vt
      where vt.election_id = v_election_id
        and vt.tps_id = v_tps_id
        and vt.candidate_id = p_candidate_id
    ) then
      raise exception using errcode = 'P0001', message = 'VOTE_TOTAL_ROW_NOT_FOUND';
    end if;
    raise exception using errcode = 'P0001', message = 'TOTAL_CANNOT_BE_NEGATIVE';
  end if;

  return query select 'inserted'::text, v_total;
end;
$$;

revoke all on function public.submit_vote_event(uuid, uuid, smallint, timestamptz) from public, anon;
grant execute on function public.submit_vote_event(uuid, uuid, smallint, timestamptz) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vote_totals'
  ) then
    alter publication supabase_realtime add table public.vote_totals;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vote_events'
  ) then
    alter publication supabase_realtime add table public.vote_events;
  end if;
end $$;
