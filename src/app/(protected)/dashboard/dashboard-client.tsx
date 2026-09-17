"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { Candidate, GolputTotal, Tps, VoteTotal } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";

type DashboardClientProps = {
  electionId: string;
  candidates: Candidate[];
  tpsRows: Tps[];
  initialTotals: VoteTotal[];
  initialGolputTotals: GolputTotal[];
  pollUrl?: string;
  standalone?: boolean;
};

type PublicResultsPayload = {
  totals: VoteTotal[];
  golputTotals: GolputTotal[];
};

function subscribeMobile(callback: () => void) {
  const query = window.matchMedia("(max-width: 767px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function getMobileSnapshot() {
  return window.matchMedia("(max-width: 767px)").matches;
}

export function DashboardClient({ electionId, candidates, tpsRows, initialTotals, initialGolputTotals, pollUrl, standalone = false }: DashboardClientProps) {
  const [totals, setTotals] = useState(initialTotals);
  const [golputTotals, setGolputTotals] = useState(initialGolputTotals);
  const [activeSlide, setActiveSlide] = useState(0);
  const isMobile = useSyncExternalStore(subscribeMobile, getMobileSnapshot, () => false);
  const supabase = useMemo(() => createClient(), []);
  const tpsPerSlide = isMobile ? 3 : 7;
  const slides = Array.from({ length: Math.ceil(tpsRows.length / tpsPerSlide) }, (_, index) => tpsRows.slice(index * tpsPerSlide, (index + 1) * tpsPerSlide));
  const visibleSlide = activeSlide % Math.max(slides.length, 1);

  useEffect(() => {
    if (pollUrl) {
      let cancelled = false;
      const refresh = async () => {
        try {
          const response = await fetch(pollUrl);
          if (!response.ok) return;
          const payload = await response.json() as PublicResultsPayload;
          if (!cancelled) {
            setTotals(payload.totals);
            setGolputTotals(payload.golputTotals);
          }
        } catch {
          // Keep the last valid snapshot when the viewer temporarily loses connection.
        }
      };
      const timer = window.setInterval(() => { void refresh(); }, 15_000);
      const handleVisibility = () => { if (document.visibilityState === "visible") void refresh(); };
      document.addEventListener("visibilitychange", handleVisibility);
      return () => {
        cancelled = true;
        window.clearInterval(timer);
        document.removeEventListener("visibilitychange", handleVisibility);
      };
    }

    const voteChannel = supabase.channel(`dashboard-${electionId}`).on("postgres_changes", { event: "UPDATE", schema: "public", table: "vote_totals", filter: `election_id=eq.${electionId}` }, (payload) => {
      const row = payload.new as VoteTotal;
      setTotals((current) => current.map((item) => item.tps_id === row.tps_id && item.candidate_id === row.candidate_id ? row : item));
    }).subscribe();
    const golputChannel = supabase.channel(`dashboard-golput-${electionId}`).on("postgres_changes", { event: "UPDATE", schema: "public", table: "golput_totals", filter: `election_id=eq.${electionId}` }, (payload) => {
      const row = payload.new as GolputTotal;
      setGolputTotals((current) => current.map((item) => item.tps_id === row.tps_id ? row : item));
    }).subscribe();
    return () => { void supabase.removeChannel(voteChannel); void supabase.removeChannel(golputChannel); };
  }, [electionId, pollUrl, supabase]);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = window.setInterval(() => setActiveSlide((current) => (current + 1) % slides.length), 8_000);
    return () => window.clearInterval(timer);
  }, [activeSlide, slides.length]);

  const candidateTotals = Object.fromEntries(candidates.map((candidate) => [candidate.id, totals.filter((row) => row.candidate_id === candidate.id).reduce((sum, row) => sum + row.total, 0)]));
  const allVotes = Object.values(candidateTotals).reduce((sum, total) => sum + total, 0);
  const percent = (total: number) => allVotes === 0 ? 0 : (total / allVotes) * 100;
  const currentSlide = slides[visibleSlide] ?? [];
  const currentRange = currentSlide.length > 0
    ? `TPS ${currentSlide[0].tps_number}–${currentSlide[currentSlide.length - 1].tps_number}`
    : "TPS";

  return <main className={`mx-auto flex w-full max-w-[1440px] flex-col gap-2 overflow-x-hidden px-2 pt-2 pb-0 md:gap-3 md:px-4 md:pt-3 md:pb-0 ${standalone ? "min-h-dvh" : "min-h-[calc(100dvh-5.25rem)] md:min-h-[calc(100dvh-6.25rem)]"}`}>
    <header className="-mx-2 grid w-[calc(100%+1rem)] shrink-0 grid-cols-[64px_minmax(0,1fr)_64px] items-center gap-2 border-b-4 border-[#3f73ad] bg-white px-2 py-2 md:-mx-4 md:w-[calc(100%+2rem)] md:grid-cols-[110px_minmax(0,1fr)_110px] md:gap-5 md:px-6 md:py-3">
      <Image src="/cibening_logo.png" width={110} height={110} priority alt="Logo Desa Cibening" className="h-[62px] w-[64px] object-contain md:h-[92px] md:w-[110px]" />
      <div className="min-w-0 text-center">
        <div className="flex items-center justify-center">
          <h1 className="whitespace-nowrap text-[clamp(1.45rem,7vw,2rem)] font-extrabold leading-[.9] tracking-[-.055em] md:text-[clamp(3rem,6.5vw,5.6rem)]">HITUNG CEPAT</h1>
        </div>
        <p className="mt-1 text-[10px] font-black uppercase leading-tight tracking-[-.03em] md:text-[clamp(1rem,2.2vw,1.8rem)]">Calon Kepala Desa Cibening 2026–2034</p>
      </div>
      <Image src="/gaskeun.PNG" width={110} height={110} priority alt="Logo Gaskeun" className="h-[62px] w-[64px] object-contain md:h-[92px] md:w-[110px]" />
    </header>
    <div className="ticker-bar shrink-0 overflow-hidden bg-red-600 py-1 text-white" aria-label="Live penghitungan suara sementara">
      <div className="ticker-track flex w-max whitespace-nowrap text-[9px] font-extrabold uppercase tracking-[.12em] md:text-xs">
        {[0, 1].map((copy) => <span key={copy} className="flex items-center" aria-hidden={copy === 1}>
          <strong className="mx-4 rounded bg-white px-2 py-0.5 text-[8px] tracking-[.16em] text-red-600 md:text-[10px]">LIVE</strong>
          <span>Penghitungan Suara Sementara Calon Kepala Desa Cibening 2026</span>
          <span className="mx-8">•</span>
          <span>Data Masuk Realtime dari 21 TPS</span>
          <span className="mx-8">•</span>
        </span>)}
      </div>
    </div>

    <div className="grid h-[42dvh] min-h-[300px] max-h-[370px] shrink-0 grid-cols-2 gap-2 md:h-[32dvh] md:min-h-[250px] md:max-h-[320px] md:gap-3">
      {candidates.map((candidate) => {
        const total = candidateTotals[candidate.id] ?? 0;
        const percentage = percent(total);
        const isCandidateOne = candidate.candidate_number === 1;
        const resultColor = isCandidateOne ? "text-[#c44848]" : "text-[#3f73ad]";
        const barColor = isCandidateOne ? "bg-[#c44848]" : "bg-[#3f73ad]";
        const numberColor = isCandidateOne ? "bg-[#c44848]" : "bg-[#3f73ad]";
        const photoSrc = isCandidateOne ? "/calon1.png" : "/calon2.jpg";
        return <section key={candidate.id} className="relative grid h-full min-w-0 grid-cols-1 grid-rows-[minmax(0,1fr)_auto_auto] gap-y-2 overflow-hidden rounded-2xl border-2 border-neutral-300 bg-white p-2 text-black shadow-lg md:grid-cols-[clamp(120px,15vw,210px)_minmax(0,1fr)] md:grid-rows-1 md:items-stretch md:gap-x-5 md:gap-y-0 md:px-5 md:pt-5 md:pb-4">
          <div className="relative col-start-1 row-start-1 min-h-0 w-full overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 shadow-md md:h-full md:max-h-[calc(40dvh-38px)] md:self-end md:rounded-t-3xl">
            <Image src={photoSrc} fill sizes="(max-width: 1000px) 180px, 210px" alt={`Foto ${candidate.candidate_name}`} className={isCandidateOne ? "object-cover object-top" : "origin-center translate-y-5 scale-[1.1] object-cover object-top md:translate-y-0 md:scale-100"} />
          </div>
          <span className={`absolute right-3 top-3 z-10 grid h-14 w-14 place-items-center rounded-full border-4 border-white text-2xl font-extrabold text-white shadow-lg md:hidden ${numberColor}`}>{candidate.candidate_number}</span>
          <div className="col-start-1 row-start-2 flex min-w-0 flex-col py-1 md:col-start-2 md:row-start-1 md:py-2">
            <div className="hidden items-center gap-3 md:flex"><span className={`grid h-14 w-14 shrink-0 place-items-center rounded-full border-4 border-white text-2xl font-extrabold text-white shadow-md ${numberColor}`}>{candidate.candidate_number}</span><p className="font-extrabold uppercase leading-tight tracking-[.15em] text-neutral-500 md:text-[clamp(.6rem,1vw,.8rem)]">Calon Kepala Desa</p></div>
            <h2 className="mt-4 hidden text-[clamp(1.35rem,2.8vw,2.3rem)] font-extrabold uppercase leading-[1.05] md:block">{candidate.candidate_name}</h2>
            <div className="mt-auto min-w-0">
              <p className="hidden text-xs font-bold uppercase leading-tight tracking-wider text-neutral-500 md:block">Perolehan<br/>sementara</p>
              <p className={`mt-1 text-center text-3xl font-extrabold leading-none tracking-[-.04em] tabular-nums md:text-right md:text-[clamp(2.25rem,3.5vw,3.25rem)] ${resultColor}`}>{percentage.toFixed(2)}%</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-200 md:mt-3 md:h-3"><div className={`h-full transition-[width] duration-300 ${barColor}`} style={{ width: `${percentage}%` }} /></div>
            </div>
          </div>
          <div className="col-start-1 row-start-3 min-h-[44px] text-center md:hidden"><p className="mb-1 text-[7px] font-extrabold uppercase tracking-[.14em] text-neutral-500">Calon Kepala Desa</p><h2 className="text-sm font-extrabold uppercase leading-[1.05] sm:text-base">{candidate.candidate_name}</h2></div>
        </section>;
      })}
    </div>

    <section className="flex min-h-[200px] flex-1 flex-col overflow-hidden rounded-2xl border border-neutral-300 bg-neutral-100 py-2 pl-2 pr-3 md:min-h-[220px] md:p-3">
      <div className="mb-1.5 flex shrink-0 items-center justify-between md:mb-2">
        <div className="min-w-0"><p className="truncate text-[7px] font-extrabold uppercase tracking-[.14em] text-neutral-500 md:text-[9px] md:tracking-[.18em]">Laporan masuk per lokasi</p><h2 className="text-sm font-extrabold leading-tight md:text-base">Rincian Setiap TPS</h2></div>
        <div className="ml-2 hidden shrink-0 text-right md:block"><p className="rounded-full bg-black px-3 py-1 text-xs font-extrabold text-white">Menampilkan {currentRange}</p><p className="mt-1 text-[10px] font-bold tabular-nums text-neutral-500">{visibleSlide + 1}/{Math.max(slides.length, 1)}</p></div>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden" aria-live="polite">
        <div key={visibleSlide} className="tps-slide-enter absolute inset-0 grid grid-cols-3 items-center gap-1.5 md:grid-cols-7 md:gap-2">
          {currentSlide.map((tps) => {
            const rowValues = candidates.map((candidate) => totals.find((row) => row.tps_id === tps.id && row.candidate_id === candidate.id)?.total ?? 0);
            const golputValue = golputTotals.find((row) => row.tps_id === tps.id)?.total ?? 0;
            return <article key={tps.id} className="flex min-w-0 flex-col rounded-xl border border-neutral-300 bg-white px-1.5 py-1.5 text-center shadow-sm md:p-2">
              <h3 className="text-xs font-extrabold md:text-[clamp(.8rem,1.5vw,1.05rem)]">TPS {tps.tps_number}</h3>
              <div className="my-1 grid min-w-0 grid-cols-2 gap-1 md:my-1.5">{candidates.map((candidate, index) => <div key={candidate.id} className={`min-w-0 rounded-md px-0.5 py-1 text-white md:px-1 ${candidate.candidate_number === 1 ? "bg-[#c44848]" : "bg-[#3f73ad]"}`}><p className="truncate text-[6px] font-bold uppercase opacity-75 md:text-[8px]">No. {candidate.candidate_number}</p><p className="text-base font-extrabold leading-none tabular-nums md:text-lg">{rowValues[index]}</p></div>)}</div>
              <p className="flex min-h-7 items-center justify-center rounded-md bg-neutral-900 px-1 py-1.5 text-[8px] font-extrabold uppercase text-white md:min-h-8 md:text-[10px]">Golput <strong className="ml-1 text-xs tabular-nums md:text-sm">{golputValue}</strong></p>
              <p className="mt-0.5 border-t border-neutral-200 pt-0.5 text-[8px] font-bold uppercase text-neutral-500 md:pt-1 md:text-[9px]">Total <strong className="ml-0.5 text-xs text-black tabular-nums md:ml-1 md:text-sm">{rowValues.reduce((a, b) => a + b, 0) + golputValue}</strong></p>
            </article>;
          })}
        </div>
      </div>
      <div className="mt-2 flex h-2 shrink-0 items-center justify-center gap-1 md:gap-1.5">{slides.map((_, index) => <button key={index} type="button" onClick={() => setActiveSlide(index)} aria-label={`Tampilkan kelompok TPS ${index + 1}`} className={`h-1.5 rounded-full transition-all ${index === visibleSlide ? "w-6 bg-black md:w-8" : "w-2 bg-neutral-300 md:w-3"}`} />)}</div>
    </section>
    <footer className="-mx-2 mt-auto grid min-h-[210px] w-[calc(100%+1rem)] shrink-0 grid-cols-[68px_minmax(0,1fr)_68px] items-center gap-3 border-y-4 border-[#3f73ad] bg-black px-3 py-6 text-white md:-mx-4 md:min-h-[96px] md:w-[calc(100%+2rem)] md:grid-cols-[68px_minmax(0,1fr)_68px] md:gap-5 md:px-5 md:py-3">
      <Image src="/cibening_logo_white.png" width={68} height={68} alt="Logo Desa Cibening" className="h-16 w-16 object-contain" />
      <div className="min-w-0 text-center uppercase md:-translate-y-[9px]">
        <p className="text-xs font-extrabold tracking-[.12em] text-white md:text-sm md:tracking-[.16em]">Media Center Gaskeun</p>
        <p className="mt-2 text-[9px] font-bold leading-snug tracking-[.02em] text-white/75 md:mt-1 md:text-[10px] md:leading-tight md:tracking-[.07em]">Data sementara dihimpun realtime oleh Tim Saksi Calon Nomor 2 · Anton Suryana S.Kom</p>
        <p className="mt-2 text-[8px] font-extrabold leading-snug tracking-[.02em] text-amber-300 md:mt-1 md:text-[9px] md:leading-tight md:tracking-[.07em]">Bukan hasil resmi penyelenggara pemilihan</p>
      </div>
      <Image src="/gaskeun.PNG" width={68} height={68} alt="Logo Gaskeun" className="h-16 w-16 object-contain" />
    </footer>
  </main>;
}
