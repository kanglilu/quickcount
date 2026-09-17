"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";

const loginSchema = z.object({
  tps: z.coerce.number().int().min(1).max(21),
  password: z.string().min(1, "Password wajib diisi"),
});

export function LoginForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const parsed = loginSchema.safeParse({ tps: form.get("tps"), password: form.get("password") });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Data login belum lengkap");
      return;
    }

    setLoading(true);
    const email = `tps${String(parsed.data.tps).padStart(2, "0")}@quickcount.local`;
    const { error: signInError } = await createClient().auth.signInWithPassword({ email, password: parsed.data.password });
    if (signInError) {
      setError("TPS atau password salah. Coba cek lagi.");
      setLoading(false);
      return;
    }
    router.replace("/count");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block">
        <span className="mb-2 block text-sm font-bold">TPS</span>
        <select name="tps" className="h-14 w-full rounded-xl border-2 border-neutral-300 bg-white px-4 text-lg font-bold">
          {Array.from({ length: 21 }, (_, index) => index + 1).map((number) => (
            <option key={number} value={number}>TPS {String(number).padStart(2, "0")}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-bold">Password</span>
        <input name="password" type="password" autoComplete="current-password" required className="h-14 w-full rounded-xl border-2 border-neutral-300 px-4 text-lg" />
      </label>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p>}
      <button disabled={loading} className="h-16 w-full rounded-xl border-2 border-black bg-white text-lg font-black text-black shadow-[0_5px_0_#101010] active:translate-y-1 active:shadow-none disabled:opacity-60">
        {loading ? "MEMERIKSA..." : "MASUK"}
      </button>
    </form>
  );
}
