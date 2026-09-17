import { getAuthContext } from "@/lib/auth-context";
import { DashboardClient } from "./dashboard-client";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const { supabase, profile } = await getAuthContext();
  if (profile.role !== "admin") redirect("/count");
  const { data: election, error: electionError } = await supabase.from("elections").select("id").order("created_at", { ascending: false }).limit(1).single();
  if (electionError || !election) throw new Error("Election tidak ditemukan.");
  const [{ data: candidates }, { data: tps }, { data: totals }, { data: golputTotals }] = await Promise.all([
    supabase.from("candidates").select("*").eq("election_id", election.id).order("candidate_number"),
    supabase.from("tps").select("*").eq("election_id", election.id).order("tps_number"),
    supabase.from("vote_totals").select("*").eq("election_id", election.id),
    supabase.from("golput_totals").select("*").eq("election_id", election.id),
  ]);
  return <DashboardClient electionId={election.id} candidates={candidates ?? []} tpsRows={tps ?? []} initialTotals={totals ?? []} initialGolputTotals={golputTotals ?? []} />;
}
