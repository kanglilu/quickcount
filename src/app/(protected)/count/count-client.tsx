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
      const active = document.visibilityState === "visible" && navigator.onLine;
      void reportPresence(active);
    };
    reportCurrentState();
    const heartbeat = window.setInterval(reportCurrentState, 20_000);
    const handleVisibility = () => reportCurrentState();
    const handleBeforeUnload = () => { void reportPresence(false); };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      void reportPresence(false);
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
    <main className="mx-auto max-w-3xl px-4 py-5 pb-12">
      <div className={`mb-5 rounded-xl border p-3 text-sm font-bold ${status.color}`} aria-live="polite">{status.dot} {status.text}</div>
      {(warning || failedCount > 0) && <div role="alert" className="mb-5 rounded-xl border border-red-300 bg-red-50 p-4 font-bold text-red-900">{warning || `${failedCount} event ditolak dan tidak dihitung.`}</div>}
      <div className="mb-5 flex items-end justify-between">
        <div><p className="text-sm font-bold uppercase tracking-wider text-neutral-500">Penghitungan</p><h1 className="text-3xl font-black">{tps.name}</h1></div>
        <p className="text-right text-sm text-neutral-600">Pending sync<br/><strong className="text-xl text-neutral-900">{pendingCount}</strong></p>
      </div>
      <div className="space-y-5">
        {candidates.map((candidate) => {
          const isCandidateOne = candidate.candidate_number === 1;
          return (
          <section key={candidate.id} className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
            <p className="text-sm font-black uppercase tracking-[.16em] text-black">Nomor Urut {candidate.candidate_number}</p>
            <h2 className="mt-1 text-xl font-black">{candidate.candidate_name}</h2>
            <p className="my-5 text-5xl font-black tabular-nums">{displayedTotals[candidate.id] ?? 0} <span className="text-lg text-neutral-500">suara</span></p>
            <button onClick={() => void enqueue(candidate, 1)} className={`h-24 w-full rounded-2xl text-2xl font-black text-white shadow-[0_6px_0_#101010] active:translate-y-1 active:shadow-none ${isCandidateOne ? "bg-[#c44848]" : "bg-[#3f73ad]"}`}>+1 SUARA</button>
            <button onClick={() => setCorrection(candidate)} className="mt-4 h-12 w-full rounded-xl border-2 border-neutral-300 font-bold text-neutral-700">Koreksi -1</button>
          </section>
        );})}
        <section className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
          <p className="text-sm font-black uppercase tracking-[.16em] text-neutral-600">Suara Tidak Sah</p>
          <h2 className="mt-1 text-xl font-black">GOLPUT</h2>
          <p className="my-5 text-5xl font-black tabular-nums">{displayedGolputTotal} <span className="text-lg text-neutral-500">suara</span></p>
          <button onClick={() => void enqueue(null, 1)} className="h-20 w-full rounded-2xl bg-neutral-900 text-2xl font-black text-white shadow-[0_6px_0_#737373] active:translate-y-1 active:shadow-none">+1 GOLPUT</button>
          <button onClick={() => setCorrection("golput")} className="mt-4 h-12 w-full rounded-xl border-2 border-neutral-300 font-bold text-neutral-700">Koreksi -1</button>
        </section>
      </div>
      <div className="mt-5 rounded-2xl bg-[var(--ink)] p-5 text-white"><p className="text-sm font-bold uppercase tracking-wider text-white/60">Total dihitung</p><p className="mt-1 text-4xl font-black tabular-nums">{grandTotal} <span className="text-lg text-white/70">suara</span></p></div>
      {correction && <ConfirmCorrection candidateLabel={correction === "golput" ? "Golput" : `Nomor Urut ${correction.candidate_number}`} onCancel={() => setCorrection(null)} onConfirm={() => { const target = correction; setCorrection(null); void enqueue(target === "golput" ? null : target, -1); }} />}
    </main>
  );
}
