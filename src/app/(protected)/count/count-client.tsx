"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import type { Candidate, Tps, VoteTotal } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";
import { offlineDb, type PendingVoteEvent } from "@/lib/offline-db";
import { ConfirmCorrection } from "@/components/confirm-correction";

const eventSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["candidate", "golput"]).default("candidate"),
  candidate_id: z.uuid().nullable(),
  delta: z.union([z.literal(1), z.literal(-1)]),
  client_created_at: z.iso.datetime(),
}).superRefine((event, context) => {
  if (event.kind === "candidate" && !event.candidate_id) context.addIssue({ code: "custom", message: "Candidate wajib diisi" });
  if (event.kind === "golput" && event.candidate_id) context.addIssue({ code: "custom", message: "Golput tidak memakai candidate" });
});

function isPermanentError(code?: string) {
  return Boolean(code && ["P0001", "22023", "23503", "23514"].includes(code));
}

export function CountClient({ userId, tps, candidates, initialTotals, initialGolputTotal }: { userId: string; tps: Tps; candidates: Candidate[]; initialTotals: VoteTotal[]; initialGolputTotal: number }) {
  const [serverTotals, setServerTotals] = useState<Record<string, number>>(() => Object.fromEntries(initialTotals.map((row) => [row.candidate_id, row.total])));
  const [serverGolputTotal, setServerGolputTotal] = useState(initialGolputTotal);
  const [queued, setQueued] = useState<PendingVoteEvent[]>([]);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [warning, setWarning] = useState("");
  const [correction, setCorrection] = useState<Candidate | "golput" | null>(null);
  const syncLock = useRef(false);
  const supabase = useMemo(() => createClient(), []);

  const reportPresence = useCallback(async (isOnline: boolean) => {
    await supabase.rpc("report_operator_status", { p_is_online: isOnline, p_current_page: "/count" });
  }, [supabase]);

  const refreshQueue = useCallback(async () => {
    const events = await offlineDb.pending_vote_events.where("owner_user_id").equals(userId).toArray();
    setQueued(events);
    return events;
  }, [userId]);

  const syncQueue = useCallback(async () => {
    if (syncLock.current) return;
    syncLock.current = true;
    setSyncing(true);
    let transientFailure = false;
    let snapshotIds = new Set<string>();
    try {
      await offlineDb.pending_vote_events.where("owner_user_id").equals(userId).and((item) => item.status === "syncing").modify({ status: "pending" });
      const events = await offlineDb.pending_vote_events
        .where("owner_user_id").equals(userId)
        .filter((item) => item.status === "pending")
        .sortBy("client_created_at");
      snapshotIds = new Set(events.map((event) => event.id));

      for (const event of events) {
        await offlineDb.pending_vote_events.update(event.id, { status: "syncing", attempts: event.attempts + 1 });
        const parsed = eventSchema.safeParse(event);
        if (!parsed.success) {
          await offlineDb.pending_vote_events.update(event.id, { status: "failed", last_error: "Format event lokal tidak valid" });
          setWarning("Ada event lokal rusak yang tidak dikirim.");
          continue;
        }

        const rpcResult = parsed.data.kind === "golput"
          ? await supabase.rpc("submit_golput_event", {
              p_event_id: parsed.data.id,
              p_delta: parsed.data.delta,
              p_client_created_at: parsed.data.client_created_at,
            })
          : await supabase.rpc("submit_vote_event", {
              p_event_id: parsed.data.id,
              p_candidate_id: parsed.data.candidate_id!,
              p_delta: parsed.data.delta,
              p_client_created_at: parsed.data.client_created_at,
            });
        const { data, error } = rpcResult;

        if (error) {
          if (isPermanentError(error.code)) {
            await offlineDb.pending_vote_events.update(event.id, { status: "failed", last_error: error.message });
            setWarning(error.message.includes("NEGATIVE") ? "Koreksi ditolak: total suara tidak boleh negatif." : "Satu suara ditolak server. Cek riwayat dan hubungi koordinator.");
            continue;
          }
          await offlineDb.pending_vote_events.update(event.id, { status: "pending", last_error: error.message });
          setOnline(false);
          transientFailure = true;
          break;
        }

        const result = data?.[0];
        await offlineDb.pending_vote_events.delete(event.id);
        if (result) {
          if ((event.kind ?? "candidate") === "golput") setServerGolputTotal(result.new_total);
          else if (event.candidate_id) setServerTotals((current) => ({ ...current, [event.candidate_id!]: result.new_total }));
        }
        setOnline(true);
      }
    } finally {
      const latest = await refreshQueue();
      setSyncing(false);
      syncLock.current = false;
      const arrivedDuringSync = latest.some((item) => item.status === "pending" && !snapshotIds.has(item.id));
      if (!transientFailure && arrivedDuringSync && navigator.onLine) {
        window.setTimeout(() => { void syncQueue(); }, 0);
      }
    }
  }, [refreshQueue, supabase, userId]);

  useEffect(() => {
    const reportCurrentState = () => {
      if (navigator.onLine) void reportPresence(true);
    };
    reportCurrentState();
    const heartbeat = window.setInterval(reportCurrentState, 20_000);
    const handleVisibility = () => reportCurrentState();
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", reportCurrentState);
    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", reportCurrentState);
    };
  }, [reportPresence]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => { void refreshQueue().then(() => syncQueue()); }, 0);
    const handleOnline = () => { setOnline(true); void syncQueue(); };
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    const retryTimer = window.setInterval(() => { if (navigator.onLine) void syncQueue(); }, 8_000);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.clearTimeout(initialTimer);
      window.clearInterval(retryTimer);
    };
  }, [refreshQueue, syncQueue]);

  useEffect(() => {
    const voteChannel = supabase
      .channel(`vote-totals-tps-${tps.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "vote_totals", filter: `tps_id=eq.${tps.id}` }, (payload) => {
        const row = payload.new as VoteTotal;
        setServerTotals((current) => ({ ...current, [row.candidate_id]: row.total }));
      })
      .subscribe();
    const golputChannel = supabase
      .channel(`golput-total-tps-${tps.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "golput_totals", filter: `tps_id=eq.${tps.id}` }, (payload) => {
        const row = payload.new as { total: number };
        setServerGolputTotal(row.total);
      })
      .subscribe();
    return () => { void supabase.removeChannel(voteChannel); void supabase.removeChannel(golputChannel); };
  }, [supabase, tps.id]);

  async function enqueue(candidate: Candidate | null, delta: 1 | -1) {
    setWarning("");
    const item: PendingVoteEvent = {
      id: crypto.randomUUID(),
      owner_user_id: userId,
      kind: candidate ? "candidate" : "golput",
      candidate_id: candidate?.id ?? null,
      delta,
      client_created_at: new Date().toISOString(),
      status: "pending",
      attempts: 0,
    };
    await offlineDb.pending_vote_events.add(item);
    setQueued((current) => [...current, item]);
    void syncQueue();
  }

  async function clearFailedEvents() {
    const failedEvents = await offlineDb.pending_vote_events
      .where("owner_user_id").equals(userId)
      .and((item) => item.status === "failed")
      .toArray();
    if (failedEvents.length > 0) {
      await offlineDb.pending_vote_events.bulkDelete(failedEvents.map((event) => event.id));
    }
    setWarning("");
    await refreshQueue();
  }

  const activeQueue = queued.filter((item) => item.status !== "failed");
  const pendingCount = activeQueue.length;
  const failedCount = queued.filter((item) => item.status === "failed").length;
  const displayedTotals = Object.fromEntries(candidates.map((candidate) => {
    const localDelta = activeQueue.filter((event) => (event.kind ?? "candidate") === "candidate" && event.candidate_id === candidate.id).reduce((sum, event) => sum + event.delta, 0);
    return [candidate.id, Math.max(0, (serverTotals[candidate.id] ?? 0) + localDelta)];
  }));
  const localGolputDelta = activeQueue.filter((event) => event.kind === "golput").reduce((sum, event) => sum + event.delta, 0);
  const displayedGolputTotal = Math.max(0, serverGolputTotal + localGolputDelta);
  const grandTotal = Object.values(displayedTotals).reduce((sum, total) => sum + total, 0) + displayedGolputTotal;

  const status = !online
    ? { color: "bg-red-50 text-red-800 border-red-200", dot: "🔴", text: `Offline — ${pendingCount} suara tersimpan di perangkat` }
    : syncing || pendingCount > 0
      ? { color: "bg-amber-50 text-amber-900 border-amber-200", dot: "🟠", text: `Menyinkronkan ${pendingCount} suara...` }
      : { color: "bg-white text-black border-neutral-300", dot: "●", text: "Online — semua data tersinkron" };

  return (
    <main className="mx-auto flex h-[calc(100dvh-5.25rem)] w-full max-w-5xl flex-col gap-2 overflow-hidden px-2 py-2 md:h-[calc(100dvh-6.25rem)] md:gap-3 md:px-4 md:py-3">
      <div className="flex shrink-0 items-center justify-between rounded-2xl bg-black px-4 py-2 text-white">
        <div><p className="text-[9px] font-bold uppercase tracking-[.16em] text-white/55">Penghitungan</p><h1 className="text-xl font-black leading-none md:text-2xl">{tps.name}</h1></div>
        <div className="flex items-center gap-5 text-right"><div><p className="text-[9px] font-bold uppercase tracking-wider text-white/55">Pending</p><p className="text-xl font-black leading-none tabular-nums">{pendingCount}</p></div><div><p className="text-[9px] font-bold uppercase tracking-wider text-white/55">Total</p><p className="text-2xl font-black leading-none tabular-nums md:text-3xl">{grandTotal}</p></div></div>
      </div>
      <div className={`shrink-0 rounded-xl border px-3 py-2 text-center text-xs font-bold md:text-sm ${status.color}`} aria-live="polite">{status.dot} {status.text}</div>
      {(warning || failedCount > 0) && <div role="alert" className="flex shrink-0 items-center justify-between gap-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-900"><span>{warning || `${failedCount} event ditolak dan tidak dihitung.`}</span><button type="button" onClick={() => void clearFailedEvents()} className="shrink-0 rounded-lg bg-red-700 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white">Bersihkan</button></div>}

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 md:gap-4">
        {candidates.map((candidate) => {
          const isCandidateOne = candidate.candidate_number === 1;
          return (
          <section key={candidate.id} className="flex min-h-0 flex-col rounded-2xl border border-[var(--line)] bg-white p-3 shadow-sm md:p-5">
            <div className="flex flex-col items-center text-center"><p className="mb-1 text-[8px] font-black uppercase tracking-[.14em] text-neutral-500 md:text-xs">Nomor Urut</p><span className={`grid h-14 w-14 shrink-0 place-items-center rounded-full text-3xl font-black text-white shadow-md md:h-20 md:w-20 md:text-5xl ${isCandidateOne ? "bg-[#c44848]" : "bg-[#3f73ad]"}`}>{candidate.candidate_number}</span></div>
            <h2 className="mt-2 min-h-[34px] text-center text-sm font-black uppercase leading-tight md:min-h-[48px] md:text-2xl">{candidate.candidate_name}</h2>
            <p className="my-2 text-4xl font-black leading-none tabular-nums md:my-4 md:text-6xl">{displayedTotals[candidate.id] ?? 0} <span className="block text-[10px] uppercase tracking-wider text-neutral-500 md:mt-1 md:text-sm">suara</span></p>
            <button onClick={() => void enqueue(candidate, 1)} className="min-h-[100px] flex-1 rounded-2xl bg-emerald-600 text-xl font-black text-white shadow-[0_6px_0_#064e3b] active:translate-y-1 active:shadow-none md:text-3xl">+1 SUARA</button>
            <button onClick={() => setCorrection(candidate)} className="mt-3 h-11 shrink-0 rounded-xl bg-red-600 text-sm font-bold text-white shadow-[0_4px_0_#7f1d1d] active:translate-y-1 active:shadow-none md:h-12 md:text-base">Koreksi -1</button>
          </section>
        );})}
      </div>

      <section className="grid h-[104px] shrink-0 grid-cols-[minmax(82px,.7fr)_minmax(0,1.5fr)_76px] items-stretch gap-2 rounded-2xl border border-neutral-300 bg-white p-2 shadow-sm md:h-[116px] md:grid-cols-[minmax(150px,.8fr)_minmax(0,2fr)_130px] md:gap-3 md:p-3">
        <div className="flex min-w-0 flex-col items-center justify-center rounded-xl bg-amber-100 px-1 text-center md:px-3"><p className="text-[7px] font-black uppercase leading-tight tracking-wider text-amber-900 md:text-xs">Golput TPS Ini</p><p className="mt-1 text-4xl font-black leading-none tabular-nums text-amber-700 md:text-5xl">{displayedGolputTotal}</p></div>
        <button onClick={() => void enqueue(null, 1)} className="rounded-xl bg-neutral-900 text-lg font-black text-white shadow-[0_5px_0_#737373] active:translate-y-1 active:shadow-none md:text-2xl">+1 GOLPUT</button>
        <button onClick={() => setCorrection("golput")} className="rounded-xl bg-red-600 text-xs font-bold leading-tight text-white shadow-[0_4px_0_#7f1d1d] active:translate-y-1 active:shadow-none md:text-sm">Koreksi<br/>-1</button>
      </section>
      {correction && <ConfirmCorrection candidateLabel={correction === "golput" ? "Golput" : `Nomor Urut ${correction.candidate_number}`} onCancel={() => setCorrection(null)} onConfirm={() => { const target = correction; setCorrection(null); void enqueue(target === "golput" ? null : target, -1); }} />}
    </main>
  );
}
