"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { PasswordField } from "@/components/password-field";

const schema = z.object({ password: z.string().min(1, "Password wajib diisi") });

export function AdminLoginForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const parsed = schema.safeParse({ password: new FormData(event.currentTarget).get("password") });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Password belum diisi"); return; }
    setLoading(true);
    const supabase = createClient();
    const { data, error: loginError } = await supabase.auth.signInWithPassword({ email: "admin@quickcount.local", password: parsed.data.password });
    if (loginError || !data.user) { setError("Password admin salah."); setLoading(false); return; }
    const { data: profile } = await supabase.from("profiles").select("role").eq("user_id", data.user.id).single();
    if (profile?.role !== "admin") { await supabase.auth.signOut(); setError("Akun ini bukan administrator."); setLoading(false); return; }
    router.replace("/dashboard"); router.refresh();
  }

  return <form onSubmit={submit} className="space-y-5">
    <PasswordField label="Kata Sandi Admin" autoFocus />
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p>}
    <button disabled={loading} className="h-16 w-full rounded-xl border-2 border-black bg-white text-lg font-black text-black shadow-[0_5px_0_#101010] active:translate-y-1 active:shadow-none disabled:opacity-60">{loading ? "MEMERIKSA..." : "MASUK ADMIN"}</button>
  </form>;
}
