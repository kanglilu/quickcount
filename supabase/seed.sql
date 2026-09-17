insert into public.elections (id, name)
values ('10000000-0000-4000-8000-000000000001', 'Pemilihan 21 TPS')
on conflict (id) do update set name = excluded.name;

insert into public.candidates (id, election_id, candidate_number, candidate_name)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1, 'MARNO KARTA SAPUTRA'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 2, 'ANTON SURYANA S.KOM')
on conflict (election_id, candidate_number)
do update set candidate_name = excluded.candidate_name;

insert into public.tps (id, election_id, tps_number, name)
select
  ('30000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000001'::uuid,
  n,
  'TPS ' || lpad(n::text, 2, '0')
from generate_series(1, 21) as n
on conflict (tps_number) do update set name = excluded.name;

insert into public.vote_totals (election_id, tps_id, candidate_id, total)
select
  t.election_id,
  t.id,
  c.id,
  0
from public.tps t
join public.candidates c on c.election_id = t.election_id
where t.election_id = '10000000-0000-4000-8000-000000000001'
on conflict (election_id, tps_id, candidate_id) do nothing;

insert into public.golput_totals (election_id, tps_id, total)
select t.election_id, t.id, 0
from public.tps t
where t.election_id = '10000000-0000-4000-8000-000000000001'
on conflict (election_id, tps_id) do nothing;
