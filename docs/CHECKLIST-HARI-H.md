# Checklist pengujian hari-H

Jalankan checklist ini di project Supabase staging sebelum dipakai, lalu ulangi smoke test inti di production.

| # | Skenario | Cara cek | Hasil yang wajib |
|---|---|---|---|
| 1 | Login TPS01 | Pilih TPS 01 dan masukkan password | Masuk ke `/count`, label akun TPS 01 |
| 2 | Isolasi TPS | Dari sesi TPS01 coba query event TPS02 | Hasil kosong/ditolak RLS |
| 3 | Sepuluh vote | Tekan +1 kandidat 1 sebanyak 10 kali | UI langsung bertambah 10 |
| 4 | Jumlah event | Query `vote_events` untuk TPS01/kandidat 1 | Tepat 10 event baru |
| 5 | Aggregate | Cek `vote_totals` | Total bertambah tepat 10 |
| 6 | Double tap | Tap cepat dengan dua jari/otomasi | Dua UUID dan dua vote tercatat |
| 7 | Concurrency | Kirim dua RPC bersamaan dengan UUID berbeda | Tidak ada lost update |
| 8 | Idempotency | Retry RPC dengan UUID dan payload yang sama | Status `duplicate`, total hanya +1 |
| 9 | Offline queue | Offline, tap 10 kali, lalu online | Pending 10 menjadi 0; server mendapat tepat 10 |
| 10 | Refresh offline | Offline, tap, refresh browser | Pending tetap ada di IndexedDB |
| 11 | Koreksi | Tambah 1 lalu koreksi -1 dan konfirmasi | Event -1 baru; event lama tetap ada |
| 12 | Anti-negatif | Saat total 0, kirim koreksi -1 | RPC menolak `TOTAL_CANNOT_BE_NEGATIVE` |
| 13 | Realtime | Buka dashboard di HP lain lalu input | Dashboard berubah tanpa refresh |
| 14 | Beban 21 TPS | Login seluruh akun/perangkat dan input bersamaan | Tiap TPS terisolasi, counter akurat |
| 15 | Logout | Tekan Keluar lalu buka `/count` | Kembali ke `/login` |
| 16 | Anonymous RPC | Panggil RPC tanpa access token | Ditolak |
| 17 | Manipulasi TPS | Tambah `tps_id` palsu via DevTools/request | Tidak berpengaruh; RPC memakai TPS profile |

## Query verifikasi

```sql
select t.name, c.candidate_number, vt.total,
  count(ve.id) filter (where ve.delta = 1) - count(ve.id) filter (where ve.delta = -1) as event_net
from vote_totals vt
join tps t on t.id = vt.tps_id
join candidates c on c.id = vt.candidate_id
left join vote_events ve
  on ve.election_id = vt.election_id
 and ve.tps_id = vt.tps_id
 and ve.candidate_id = vt.candidate_id
group by t.name, t.tps_number, c.candidate_number, vt.total
order by t.tps_number, c.candidate_number;
```

Semua baris harus punya `total = event_net`.
