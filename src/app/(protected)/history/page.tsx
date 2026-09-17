import { getAuthContext } from "@/lib/auth-context";
import { HistoryClient, type HistoryEvent } from "./history-client";
import { redirect } from "next/navigation";

export default async function HistoryPage() {
  const { supabase, profile } = await getAuthContext();
  if (profile.role !== "admin") redirect("/count");
  const { data, error } = await supabase
    .from("vote_events")
    .select("id,tps_id,candidate_id,vote_kind,delta,created_at,client_created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  const [{ data: candidates }, { data: tpsRows }] = await Promise.all([
    supabase.from("candidates").select("*"),
    supabase.from("tps").select("*"),
  ]);
  if (error) throw new Error("Gagal mengambil riwayat.");
  return <HistoryClient initialEvents={(data ?? []) as HistoryEvent[]} candidates={candidates ?? []} tpsRows={tpsRows ?? []} />;
}
