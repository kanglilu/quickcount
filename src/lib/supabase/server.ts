import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";
import { getSupabaseEnv } from "@/lib/supabase/env";

export async function createClient() {
  const cookieStore = await cookies();
  const env = getSupabaseEnv();

  return createServerClient<Database>(env.url, env.publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies. proxy.ts refreshes sessions.
        }
      },
    },
  });
}
