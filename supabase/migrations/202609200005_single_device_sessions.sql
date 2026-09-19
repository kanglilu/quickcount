create table if not exists public.operator_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tps_id uuid not null unique references public.tps(id) on delete cascade,
  device_id uuid not null,
  last_seen_at timestamptz not null default now(),
  lease_expires_at timestamptz not null default (now() + interval '65 seconds'),
  created_at timestamptz not null default now()
);

create index if not exists operator_sessions_lease_idx
on public.operator_sessions (lease_expires_at);

alter table public.operator_sessions enable row level security;

drop policy if exists "admin can read operator sessions" on public.operator_sessions;
create policy "admin can read operator sessions"
on public.operator_sessions for select to authenticated
using (exists (
  select 1 from public.profiles p
  where p.user_id = (select auth.uid()) and p.role = 'admin'
));

revoke all on public.operator_sessions from anon;
revoke insert, update, delete on public.operator_sessions from authenticated;
grant select on public.operator_sessions to authenticated;
grant all privileges on public.operator_sessions to service_role;

create or replace function public.claim_operator_session(p_device_id uuid)
returns table (session_status text, lease_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_tps_id uuid;
  v_lease timestamptz;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if p_device_id is null then
    raise exception using errcode = '22023', message = 'DEVICE_ID_REQUIRED';
  end if;

  select p.tps_id into v_tps_id
  from public.profiles p
  where p.user_id = v_user_id and p.role = 'witness';

  if v_tps_id is null then
    raise exception using errcode = '42501', message = 'WITNESS_PROFILE_NOT_FOUND';
  end if;

  insert into public.operator_sessions (user_id, tps_id, device_id, last_seen_at, lease_expires_at)
  values (v_user_id, v_tps_id, p_device_id, now(), now() + interval '65 seconds')
  on conflict (user_id) do update
  set tps_id = excluded.tps_id,
      device_id = excluded.device_id,
      last_seen_at = now(),
      lease_expires_at = now() + interval '65 seconds'
  where public.operator_sessions.device_id = excluded.device_id
     or public.operator_sessions.lease_expires_at <= now()
  returning public.operator_sessions.lease_expires_at into v_lease;

  if v_lease is null then
    select s.lease_expires_at into v_lease
    from public.operator_sessions s
    where s.user_id = v_user_id;
    return query select 'in_use'::text, v_lease;
    return;
  end if;

  insert into public.operator_status (user_id, tps_id, is_online, current_page, last_seen_at)
  values (v_user_id, v_tps_id, true, '/count', now())
  on conflict (user_id) do update
  set tps_id = excluded.tps_id,
      is_online = true,
      current_page = '/count',
      last_seen_at = now();

  return query select 'claimed'::text, v_lease;
end;
$$;

create or replace function public.heartbeat_operator_session(p_device_id uuid)
returns table (session_status text, lease_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_tps_id uuid;
  v_lease timestamptz;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  update public.operator_sessions s
  set last_seen_at = now(),
      lease_expires_at = now() + interval '65 seconds'
  where s.user_id = v_user_id
    and s.device_id = p_device_id
    and s.lease_expires_at > now()
  returning s.tps_id, s.lease_expires_at into v_tps_id, v_lease;

  if v_tps_id is null then
    return query select 'replaced'::text, null::timestamptz;
    return;
  end if;

  insert into public.operator_status (user_id, tps_id, is_online, current_page, last_seen_at)
  values (v_user_id, v_tps_id, true, '/count', now())
  on conflict (user_id) do update
  set is_online = true,
      current_page = '/count',
      last_seen_at = now();

  return query select 'active'::text, v_lease;
end;
$$;

create or replace function public.release_operator_session(p_device_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_tps_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then return false; end if;

  delete from public.operator_sessions s
  where s.user_id = v_user_id and s.device_id = p_device_id
  returning s.tps_id into v_tps_id;

  if v_tps_id is null then return false; end if;

  update public.operator_status
  set is_online = false, last_seen_at = now()
  where user_id = v_user_id;
  return true;
end;
$$;

create or replace function public.admin_release_operator_session(p_tps_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if not exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;

  delete from public.operator_sessions s
  where s.tps_id = p_tps_id
  returning s.user_id into v_user_id;

  if v_user_id is null then return false; end if;

  update public.operator_status
  set is_online = false, last_seen_at = now()
  where user_id = v_user_id;
  return true;
end;
$$;

create or replace function public.submit_vote_event_device(
  p_device_id uuid,
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
  v_touched integer;
begin
  update public.operator_sessions s
  set last_seen_at = now(), lease_expires_at = now() + interval '65 seconds'
  where s.user_id = auth.uid()
    and s.device_id = p_device_id
    and s.lease_expires_at > now();
  get diagnostics v_touched = row_count;
  if v_touched = 0 then
    raise exception using errcode = 'P0001', message = 'SESSION_REPLACED';
  end if;

  return query select * from public.submit_vote_event(
    p_event_id, p_candidate_id, p_delta, p_client_created_at
  );
end;
$$;

create or replace function public.submit_golput_event_device(
  p_device_id uuid,
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
  v_touched integer;
begin
  update public.operator_sessions s
  set last_seen_at = now(), lease_expires_at = now() + interval '65 seconds'
  where s.user_id = auth.uid()
    and s.device_id = p_device_id
    and s.lease_expires_at > now();
  get diagnostics v_touched = row_count;
  if v_touched = 0 then
    raise exception using errcode = 'P0001', message = 'SESSION_REPLACED';
  end if;

  return query select * from public.submit_golput_event(
    p_event_id, p_delta, p_client_created_at
  );
end;
$$;

revoke all on function public.claim_operator_session(uuid) from public, anon;
revoke all on function public.heartbeat_operator_session(uuid) from public, anon;
revoke all on function public.release_operator_session(uuid) from public, anon;
revoke all on function public.admin_release_operator_session(uuid) from public, anon;
revoke all on function public.submit_vote_event_device(uuid, uuid, uuid, smallint, timestamptz) from public, anon;
revoke all on function public.submit_golput_event_device(uuid, uuid, smallint, timestamptz) from public, anon;

grant execute on function public.claim_operator_session(uuid) to authenticated;
grant execute on function public.heartbeat_operator_session(uuid) to authenticated;
grant execute on function public.release_operator_session(uuid) to authenticated;
grant execute on function public.admin_release_operator_session(uuid) to authenticated;
grant execute on function public.submit_vote_event_device(uuid, uuid, uuid, smallint, timestamptz) to authenticated;
grant execute on function public.submit_golput_event_device(uuid, uuid, smallint, timestamptz) to authenticated;

revoke execute on function public.submit_vote_event(uuid, uuid, smallint, timestamptz) from authenticated;
revoke execute on function public.submit_golput_event(uuid, smallint, timestamptz) from authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'operator_sessions'
  ) then
    alter publication supabase_realtime add table public.operator_sessions;
  end if;
end $$;
