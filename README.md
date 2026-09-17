# Quick Count 21 TPS

Aplikasi operasional mobile-first untuk input suara per tap, realtime dashboard, audit trail, dan antrean offline. Backend sepenuhnya memakai Supabase Auth, PostgreSQL, RLS, RPC, dan Realtime; tidak ada backend terpisah.

## Arsitektur keamanan

- Browser hanya mengirim `event_id`, `candidate_id`, `delta`, dan waktu client.
- RPC `submit_vote_event` mengambil user dari `auth.uid()` dan TPS dari `profiles`; browser tidak bisa memilih TPS/user tujuan.
- Insert event dan increment counter berjalan dalam satu transaksi PostgreSQL.
- Primary key UUID membuat retry idempotent. UUID yang sama dengan payload berbeda ditolak.
- Increment dilakukan langsung di PostgreSQL, bukan pola read-modify-write dari frontend.
- RLS hanya memperbolehkan saksi membaca event TPS-nya sendiri. `vote_totals` dapat dibaca semua user authenticated, tapi tidak dapat ditulis langsung.
- Koreksi adalah event `-1`; event lama tidak pernah dihapus. Total negatif ditolak database.
- Service Role hanya digunakan script admin lokal.

## Setup lokal

Prasyarat: Node.js 22+, npm, project Supabase, dan Supabase CLI (opsional tapi direkomendasikan).

```bash
npm install
cp .env.example .env.local
```

Isi `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
TPS_DEFAULT_PASSWORD=...
```

Jalankan migration dan seed melalui Supabase CLI:

```bash
supabase link --project-ref PROJECT_REF
supabase db push
supabase db seed
```

Atau salin berurutan isi `supabase/migrations/202609170001_quickcount_schema.sql` lalu `supabase/seed.sql` ke SQL Editor Supabase.

Setelah tabel berisi 21 TPS, buat akun Auth dan profile:

```bash
npm run create:tps-users
```

Script membaca `.env.local`. Untuk password unik, gunakan `TPS_PASSWORDS_JSON`; key-nya `TPS01` sampai `TPS21`. Existing user tidak di-reset kecuali `RESET_EXISTING_PASSWORDS=true`.

Lalu jalankan aplikasi:

```bash
npm run dev
```

Buka `http://localhost:3000`. Email internal dibentuk otomatis dari pilihan TPS dan tidak ditampilkan ke operator.

## Alur offline dan sinkronisasi

Setiap tap membuat UUID, lalu event disimpan ke IndexedDB sebelum UI di-update. Queue dikirim satu per satu agar mudah direkonsiliasi. Error jaringan mempertahankan event sebagai `pending`; browser event `online` dan retry timer memicu sinkronisasi ulang. Error bisnis permanen ditandai `failed` dan optimistic count di-rollback. Queue dipisah berdasarkan `owner_user_id`, jadi pergantian akun di perangkat yang sama tidak mencampur event.

Status warna selalu terlihat di halaman hitung:

- hijau: semua tersinkron;
- oranye: ada event yang sedang/pending dikirim;
- merah: offline, event aman di perangkat.

## Realtime

Migration menambahkan `vote_totals` dan `vote_events` ke publication `supabase_realtime`. Halaman hitung subscribe hanya ke total TPS aktif; dashboard subscribe ke seluruh total election; history subscribe hanya ke event TPS aktif. RLS tetap berlaku pada payload Realtime.

## Validasi sebelum deploy

```bash
npm run typecheck
npm run lint
npm run build
```

Checklist fungsional lengkap ada di [`docs/CHECKLIST-HARI-H.md`](docs/CHECKLIST-HARI-H.md). Pengujian RLS/idempotency wajib memakai project staging karena memerlukan Auth dan PostgreSQL Supabase aktif.

## Deploy Vercel

1. Push repository ke Git provider lalu import ke Vercel.
2. Tambahkan hanya `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` di Vercel Environment Variables.
3. Jangan tambahkan `SUPABASE_SERVICE_ROLE_KEY`, password TPS, atau `TPS_PASSWORDS_JSON` ke Vercel.
4. Deploy dan gunakan URL bawaan `<project-name>.vercel.app`.
5. Di Supabase Authentication URL Configuration, set Site URL ke URL production Vercel.
6. Di Supabase Authentication, matikan opsi public user sign-up. Aplikasi memang tidak punya UI daftar, dan RLS juga menolak akun tanpa profile, tapi pengaturan provider tetap wajib dikunci.
7. Jalankan checklist staging/production smoke test sebelum penghitungan dimulai.

Domain bukan lapisan keamanan. Semua akses input tetap diproteksi session Auth, RLS, dan RPC database.

## Operasional hari-H

- Siapkan satu perangkat dan charger/power bank per TPS.
- Login dan tes satu vote + satu koreksi sebelum penghitungan resmi, lalu pastikan kembali ke nol.
- Jangan hapus data browser saat masih ada status merah/oranye.
- Pantau dashboard dan query rekonsiliasi `total = event_net` dari checklist.
- Simpan password akun melalui password manager/kanal aman, bukan di repository atau chat publik.
