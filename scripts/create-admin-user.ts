import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../src/lib/database.types";

try { process.loadEnvFile?.(".env.local"); } catch { /* Shell environment may already be configured. */ }

const env = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  ADMIN_PASSWORD: z.string().min(12),
}).parse(process.env);

const admin = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const email = "admin@quickcount.local";
  const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;
  let user = listed.users.find((item) => item.email?.toLowerCase() === email);

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: env.ADMIN_PASSWORD, email_confirm: true, user_metadata: { role: "admin" } });
    if (error || !data.user) throw error ?? new Error("Gagal membuat akun admin");
    user = data.user;
    console.log("Akun admin dibuat.");
  } else {
    const { error } = await admin.auth.admin.updateUserById(user.id, { password: env.ADMIN_PASSWORD });
    if (error) throw error;
    console.log("Password akun admin diperbarui.");
  }

  const { error: profileError } = await admin.from("profiles").upsert({ user_id: user.id, tps_id: null, role: "admin" }, { onConflict: "user_id" });
  if (profileError) throw profileError;
  console.log("Profile admin aktif dan tidak terikat ke TPS.");
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
