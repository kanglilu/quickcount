import { getAuthContext } from "@/lib/auth-context";
import { CountClient } from "./count-client";
import { redirect } from "next/navigation";
import { getWitnessName } from "@/lib/witnesses";

export default async function CountPage() {
  const { supabase, user, profile, tps } = await getAuthContext();
  if (profile.role === "admin") redirect("/dashboard");
  if (!tps) throw new Error("TPS akun tidak ditemukan.");
  const [{ data: candidates, error: candidateError }, { data: totals, error: totalError }, { data: golputTotal, error: golputError }] = await Promise.all([
    supabase.from("candidates").select("*").eq("election_id", tps.election_id).order("candidate_number"),
    supabase.from("vote_totals").select("*").eq("tps_id", tps.id),
    supabase.from("golput_totals").select("total").eq("tps_id", tps.id).single(),
  ]);
  if (candidateError || totalError || golputError) throw new Error("Gagal mengambil data penghitungan.");

  return <CountClient userId={user.id} tps={tps} operatorName={getWitnessName(tps.tps_number)} candidates={candidates ?? []} initialTotals={totals ?? []} initialGolputTotal={golputTotal?.total ?? 0} />;
}
