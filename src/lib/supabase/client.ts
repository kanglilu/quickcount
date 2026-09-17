import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getSupabaseEnv } from "@/lib/supabase/env";

let browserClient: SupabaseClient<Database> | undefined;

export function createClient() {
  const env = getSupabaseEnv();
  browserClient ??= createBrowserClient<Database>(env.url, env.publishableKey);
  return browserClient;
}
