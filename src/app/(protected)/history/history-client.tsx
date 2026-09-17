"use client";

import { useEffect, useMemo, useState } from "react";
import type { Candidate, Tps } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";

export type HistoryEvent = { id: string; tps_id: string; candidate_id: string | null; vote_kind: "candidate" | "golput"; delta: number; created_at: string; client_created_at: string | null };

export function HistoryClient({ initialEvents, candidates, tpsRows }: { initialEvents: HistoryEvent[]; candidates: Candidate[]; tpsRows: Tps[] }) {
  const [events, setEvents] = useState(initialEvents);
  const supabase = useMemo(() => createClient(), []);
  const labels = Object.fromEntries(candidates.map((candidate) => [candidate.id, `Nomor ${candidate.candidate_number}`]));
  const tpsLabels = Object.fromEntries(tpsRows.map((tps) => [tps.id, tps.name]));

  useEffect(() => {
    const channel = supabase.channel("history-admin").on("postgres_changes", { event: "INSERT", schema: "public", table: "vote_events" }, (payload) => {
      setEvents((current) => [payload.new as HistoryEvent, ...current].slice(0, 500));
    }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [supabase]);

  return <main className="mx-auto max-w-3xl px-4 py-6 pb-12">
    <p className="text-sm font-black uppercase tracking-[.2em] text-black">Audit trail</p><h1 className="text-3xl font-black">Riwayat Semua TPS</h1>
    <p className="mt-2 text-neutral-600">500 event terbaru dari seluruh TPS. Data tidak bisa diedit atau dihapus.</p>
    <div className="mt-6 overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
      {events.length === 0 && <p className="p-6 text-center text-neutral-500">Belum ada suara tercatat.</p>}
      {events.map((event) => <div key={event.id} className="flex items-center justify-between border-b border-[var(--line)] p-4 last:border-0">
        <div><p className="font-black">{tpsLabels[event.tps_id] ?? "TPS"} · {event.vote_kind === "golput" ? "Golput" : (event.candidate_id ? labels[event.candidate_id] : "Kandidat")}</p><p className="mt-1 text-sm text-neutral-500">{new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", day: "2-digit", month: "short" }).format(new Date(event.created_at))}</p></div>
        <span className={`rounded-lg border px-3 py-2 text-lg font-black ${event.delta > 0 ? "border-black bg-white text-black" : "border-red-200 bg-red-50 text-red-800"}`}>{event.delta > 0 ? "+1" : "-1"}</span>
      </div>)}
    </div>
  </main>;
}
