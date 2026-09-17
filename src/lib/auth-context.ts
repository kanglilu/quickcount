import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function getAuthContext() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("user_id,tps_id,role")
    .eq("user_id", user.id)
    .single();
  if (error || !profile) throw new Error("Akun belum memiliki profile akses. Hubungi administrator.");

  if (profile.role === "admin") {
    return { supabase, user, profile, tps: null };
  }
  if (!profile.tps_id) throw new Error("Akun petugas belum terhubung ke TPS.");

  const { data: tps, error: tpsError } = await supabase.from("tps")
    .select("id,election_id,tps_number,name,created_at").eq("id", profile.tps_id).single();
  if (tpsError || !tps) throw new Error("Data TPS tidak ditemukan.");

  return { supabase, user, profile, tps };
}
