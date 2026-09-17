create table if not exists public.operator_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tps_id uuid not null unique references public.tps(id) on delete cascade,
  is_online boolean not null default false,
  current_page text not null default '/count' check (current_page in ('/count')),
  last_seen_at timestamptz not null default now()
);

create index if not exists operator_status_last_seen_idx
on public.operator_status (last_seen_at desc);

alter table public.operator_status enable row level security;

drop policy if exists "admin can read operator status" on public.operator_status;
create policy "admin can read operator status"
on public.operator_status for select to authenticated
using (exists (
  select 1 from public.profiles p
  where p.user_id = (select auth.uid()) and p.role = 'admin'
));

revoke all on public.operator_status from anon;
revoke insert, update, delete on public.operator_status from authenticated;
grant select on public.operator_status to authenticated;
grant all privileges on public.operator_status to service_role;

create or replace function public.report_operator_status(
  p_is_online boolean,
  p_current_page text default '/count'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_tps_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if p_current_page <> '/count' then
    raise exception using errcode = '22023', message = 'INVALID_PAGE';
  end if;

  select p.tps_id into v_tps_id
  from public.profiles p
  where p.user_id = v_user_id and p.role = 'witness';

  if v_tps_id is null then
    raise exception using errcode = '42501', message = 'WITNESS_PROFILE_NOT_FOUND';
  end if;

  insert into public.operator_status (user_id, tps_id, is_online, current_page, last_seen_at)
  values (v_user_id, v_tps_id, p_is_online, p_current_page, now())
  on conflict (user_id) do update
  set tps_id = excluded.tps_id,
      is_online = excluded.is_online,
      current_page = excluded.current_page,
      last_seen_at = excluded.last_seen_at;
end;
$$;

revoke all on function public.report_operator_status(boolean, text) from public, anon;
grant execute on function public.report_operator_status(boolean, text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'operator_status'
  ) then
    alter publication supabase_realtime add table public.operator_status;
  end if;
end $$;
