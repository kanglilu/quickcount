"use client";

import { useEffect, useMemo, useState } from "react";
import type { OperatorStatus, Tps } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";

const ACTIVE_TIMEOUT_MS = 50_000;

function lastSeenLabel(value: string | undefined, now: number) {
  if (!value) return "Belum pernah aktif";
  const seconds = Math.max(0, Math.floor((now - new Date(value).getTime()) / 1000));
  if (seconds < 10) return "Baru saja";
  if (seconds < 60) return `${seconds} detik lalu`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} menit lalu`;
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function MonitoringClient({ tpsRows, initialStatuses, serverNow }: { tpsRows: Tps[]; initialStatuses: OperatorStatus[]; serverNow: string }) {
  const [statuses, setStatuses] = useState(initialStatuses);
  const [now, setNow] = useState(() => new Date(serverNow).getTime());
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 5_000);
    const channel = supabase
      .channel("admin-operator-monitoring")
      .on("postgres_changes", { event: "*", schema: "public", table: "operator_status" }, (payload) => {
        if (payload.eventType === "DELETE") {
          const deleted = payload.old as Pick<OperatorStatus, "user_id">;
          setStatuses((current) => current.filter((item) => item.user_id !== deleted.user_id));
          return;
        }
        const row = payload.new as OperatorStatus;
        setStatuses((current) => {
          const exists = current.some((item) => item.user_id === row.user_id);
          return exists ? current.map((item) => item.user_id === row.user_id ? row : item) : [...current, row];
        });
        setNow(Date.now());
      })
      .subscribe();

    return () => {
      window.clearInterval(clock);
      void supabase.removeChannel(channel);
    };
  }, [supabase]);

  const statusByTps = Object.fromEntries(statuses.map((status) => [status.tps_id, status]));
  const activeCount = tpsRows.filter((tps) => {
    const status = statusByTps[tps.id];
    return Boolean(status?.is_online && now - new Date(status.last_seen_at).getTime() <= ACTIVE_TIMEOUT_MS);
  }).length;

  return <main className="mx-auto max-w-6xl px-4 py-6 pb-12">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-sm font-extrabold uppercase tracking-[.18em] text-neutral-500">Realtime Petugas</p><h1 className="text-3xl font-extrabold">Monitoring TPS</h1><p className="mt-1 text-sm text-neutral-600">Status aktif diperbarui setiap 20 detik.</p></div>
      <div className="rounded-2xl bg-black px-5 py-3 text-right text-white"><p className="text-[10px] font-bold uppercase tracking-wider text-white/60">Petugas aktif</p><p className="text-3xl font-extrabold tabular-nums">{activeCount}<span className="text-lg text-white/50">/{tpsRows.length}</span></p></div>
    </div>

    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
      {tpsRows.map((tps) => {
        const status = statusByTps[tps.id];
        const active = Boolean(status?.is_online && now - new Date(status.last_seen_at).getTime() <= ACTIVE_TIMEOUT_MS);
        return <article key={tps.id} className={`rounded-2xl border-2 bg-white p-4 shadow-sm ${active ? "border-emerald-500" : "border-neutral-200"}`}>
          <div className="flex items-center justify-between gap-2"><h2 className="text-lg font-extrabold">TPS {tps.tps_number}</h2><span className={`h-3 w-3 shrink-0 rounded-full ${active ? "bg-emerald-500 shadow-[0_0_0_5px_rgba(16,185,129,.14)]" : "bg-neutral-300"}`} /></div>
          <p className={`mt-4 text-sm font-extrabold uppercase ${active ? "text-emerald-700" : "text-neutral-500"}`}>{active ? "Aktif" : "Tidak aktif"}</p>
          <p className="mt-1 text-xs text-neutral-500">{lastSeenLabel(status?.last_seen_at, now)}</p>
          <p className="mt-3 border-t border-neutral-100 pt-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400">{active ? "Penghitungan terbuka" : "Menunggu petugas"}</p>
        </article>;
      })}
    </div>
  </main>;
}
