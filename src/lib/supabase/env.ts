const placeholderUrl = "https://placeholder.supabase.co";
const placeholderKey = "placeholder-publishable-key";

export function getSupabaseEnv() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? placeholderUrl,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? placeholderKey,
    configured: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  };
}
