import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../src/lib/database.types";

try {
  process.loadEnvFile?.(".env.local");
} catch {
  // Environment may already be supplied by the shell/CI.
}

const env = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  TPS_DEFAULT_PASSWORD: z.string().min(8).optional(),
  TPS_PASSWORDS_JSON: z.string().optional(),
  RESET_EXISTING_PASSWORDS: z.enum(["true", "false"]).optional(),
}).parse(process.env);

const passwordMap = env.TPS_PASSWORDS_JSON
  ? z.record(z.string(), z.string().min(8)).parse(JSON.parse(env.TPS_PASSWORDS_JSON))
  : {};

const admin = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: tpsRows, error: tpsError } = await admin.from("tps").select("id,tps_number").order("tps_number");
  if (tpsError) throw tpsError;
  if (!tpsRows || tpsRows.length !== 21) throw new Error(`Seed TPS belum lengkap. Ditemukan ${tpsRows?.length ?? 0}, seharusnya 21.`);

  const { data: usersPage, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;
  const existingByEmail = new Map(usersPage.users.map((user) => [user.email?.toLowerCase(), user]));

  for (const tps of tpsRows) {
    const code = `TPS${String(tps.tps_number).padStart(2, "0")}`;
    const email = `${code.toLowerCase()}@quickcount.local`;
    const password = passwordMap[code] ?? env.TPS_DEFAULT_PASSWORD;
    if (!password) throw new Error(`Password untuk ${code} belum tersedia.`);

    let user = existingByEmail.get(email);
    if (!user) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { tps_code: code },
      });
      if (error || !data.user) throw error ?? new Error(`Gagal membuat ${code}`);
      user = data.user;
      console.log(`Dibuat: ${code}`);
    } else if (env.RESET_EXISTING_PASSWORDS === "true") {
      const { error } = await admin.auth.admin.updateUserById(user.id, { password });
      if (error) throw error;
      console.log(`Password diperbarui: ${code}`);
    } else {
      console.log(`Sudah ada: ${code}`);
    }

    const { error: profileError } = await admin.from("profiles").upsert({
      user_id: user.id,
      tps_id: tps.id,
      role: "witness",
    }, { onConflict: "user_id" });
    if (profileError) throw profileError;
  }

  console.log("Selesai: 21 akun sudah terhubung ke TPS masing-masing.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
