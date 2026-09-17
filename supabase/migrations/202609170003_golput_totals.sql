alter table public.vote_events
  add column if not exists vote_kind text not null default 'candidate';

alter table public.vote_events
  alter column candidate_id drop not null;

alter table public.vote_events
  drop constraint if exists vote_events_vote_kind_check;

alter table public.vote_events
  add constraint vote_events_vote_kind_check check (
    (vote_kind = 'candidate' and candidate_id is not null)
    or (vote_kind = 'golput' and candidate_id is null)
  );

create table if not exists public.golput_totals (
  election_id uuid not null references public.elections(id) on delete restrict,
  tps_id uuid not null,
  total integer not null default 0 check (total >= 0),
  updated_at timestamptz not null default now(),
  primary key (election_id, tps_id),
  foreign key (tps_id, election_id) references public.tps(id, election_id) on delete restrict
);

insert into public.golput_totals (election_id, tps_id, total)
select t.election_id, t.id, 0
from public.tps t
on conflict (election_id, tps_id) do nothing;

alter table public.golput_totals enable row level security;

drop policy if exists "authenticated can read golput totals" on public.golput_totals;
create policy "authenticated can read golput totals"
on public.golput_totals for select to authenticated
using (exists (
  select 1 from public.profiles p where p.user_id = (select auth.uid())
));

revoke all on public.golput_totals from anon;
revoke insert, update, delete on public.golput_totals from authenticated;
grant select on public.golput_totals to authenticated;
grant all privileges on public.golput_totals to service_role;

create or replace function public.submit_golput_event(
  p_event_id uuid,
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

  if p_event_id is null or p_delta is null or p_delta not in (-1, 1) then
    raise exception using errcode = '22023', message = 'INVALID_EVENT';
  end if;

  select p.tps_id, t.election_id
    into v_tps_id, v_election_id
  from public.profiles p
  join public.tps t on t.id = p.tps_id
  where p.user_id = v_user_id and p.role = 'witness';

  if v_tps_id is null then
    raise exception using errcode = '42501', message = 'PROFILE_OR_TPS_NOT_FOUND';
  end if;

  insert into public.vote_events (
    id, election_id, tps_id, candidate_id, user_id, delta, client_created_at, vote_kind
  ) values (
    p_event_id, v_election_id, v_tps_id, null, v_user_id, p_delta, p_client_created_at, 'golput'
  )
  on conflict (id) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is null then
    select * into v_existing from public.vote_events where id = p_event_id;
    if v_existing.user_id is distinct from v_user_id
      or v_existing.tps_id is distinct from v_tps_id
      or v_existing.vote_kind is distinct from 'golput'
      or v_existing.candidate_id is not null
      or v_existing.delta is distinct from p_delta then
      raise exception using errcode = '22023', message = 'EVENT_ID_PAYLOAD_MISMATCH';
    end if;

    select gt.total into v_total
    from public.golput_totals gt
    where gt.election_id = v_election_id and gt.tps_id = v_tps_id;
    return query select 'duplicate'::text, v_total;
    return;
  end if;

  update public.golput_totals gt
  set total = gt.total + p_delta, updated_at = now()
  where gt.election_id = v_election_id
    and gt.tps_id = v_tps_id
    and gt.total + p_delta >= 0
  returning gt.total into v_total;

  if v_total is null then
    if not exists (
      select 1 from public.golput_totals gt
      where gt.election_id = v_election_id and gt.tps_id = v_tps_id
    ) then
      raise exception using errcode = 'P0001', message = 'GOLPUT_TOTAL_ROW_NOT_FOUND';
    end if;
    raise exception using errcode = 'P0001', message = 'TOTAL_CANNOT_BE_NEGATIVE';
  end if;

  return query select 'inserted'::text, v_total;
end;
$$;

revoke all on function public.submit_golput_event(uuid, smallint, timestamptz) from public, anon;
grant execute on function public.submit_golput_event(uuid, smallint, timestamptz) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'golput_totals'
  ) then
    alter publication supabase_realtime add table public.golput_totals;
  end if;
end $$;
