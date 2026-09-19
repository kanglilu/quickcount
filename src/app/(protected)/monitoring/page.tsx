import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth-context";
import { MonitoringClient } from "./monitoring-client";

export default async function MonitoringPage() {
  const { supabase, profile } = await getAuthContext();
  if (profile.role !== "admin") redirect("/count");

  const [{ data: tpsRows, error: tpsError }, { data: statuses, error: statusError }, { data: sessions }] = await Promise.all([
    supabase.from("tps").select("*").order("tps_number"),
    supabase.from("operator_status").select("*"),
    supabase.from("operator_sessions").select("*"),
  ]);

  if (tpsError || statusError) throw new Error("Gagal mengambil status petugas.");

  return <MonitoringClient tpsRows={tpsRows ?? []} initialStatuses={statuses ?? []} initialSessions={sessions ?? []} serverNow={new Date().toISOString()} />;
}
