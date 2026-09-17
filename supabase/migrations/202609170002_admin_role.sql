alter table public.profiles alter column tps_id drop not null;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('witness', 'admin'));

create unique index if not exists profiles_single_admin_idx
on public.profiles (role)
where role = 'admin';

drop policy if exists "users can read own tps events" on public.vote_events;
create policy "witness own events or admin all events"
on public.vote_events for select to authenticated
using (
  exists (
    select 1 from public.profiles admin_profile
    where admin_profile.user_id = (select auth.uid())
      and admin_profile.role = 'admin'
  )
  or (
    user_id = (select auth.uid())
    and tps_id = (
      select witness_profile.tps_id
      from public.profiles witness_profile
      where witness_profile.user_id = (select auth.uid())
        and witness_profile.role = 'witness'
    )
  )
);
