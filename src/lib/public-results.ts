import "server-only";

import type { Candidate, GolputTotal, Tps, VoteTotal } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";

export type PublicResults = {
  electionId: string;
  candidates: Candidate[];
  tpsRows: Tps[];
  totals: VoteTotal[];
  golputTotals: GolputTotal[];
};

export async function getPublicResults(): Promise<PublicResults> {
  const supabase = createAdminClient();
  const { data: election, error: electionError } = await supabase
    .from("elections")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (electionError || !election) throw new Error("Election tidak ditemukan.");

  const [candidateResult, tpsResult, totalResult, golputResult] = await Promise.all([
    supabase.from("candidates").select("*").eq("election_id", election.id).order("candidate_number"),
    supabase.from("tps").select("*").eq("election_id", election.id).order("tps_number"),
    supabase.from("vote_totals").select("*").eq("election_id", election.id),
    supabase.from("golput_totals").select("*").eq("election_id", election.id),
  ]);

  const error = candidateResult.error ?? tpsResult.error ?? totalResult.error ?? golputResult.error;
  if (error) throw new Error(`Gagal mengambil hasil publik: ${error.message}`);

  return {
    electionId: election.id,
    candidates: candidateResult.data ?? [],
    tpsRows: tpsResult.data ?? [],
    totals: totalResult.data ?? [],
    golputTotals: golputResult.data ?? [],
  };
}
