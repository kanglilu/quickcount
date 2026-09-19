"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { PasswordField } from "@/components/password-field";
import { witnesses } from "@/lib/witnesses";
import { getDeviceId } from "@/lib/device-session";

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
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: parsed.data.password });
    if (signInError) {
      setError("TPS atau password salah. Coba cek lagi.");
      setLoading(false);
      return;
    }
    const { data: sessionData, error: sessionError } = await supabase.rpc("claim_operator_session", { p_device_id: getDeviceId() });
    const migrationMissing = sessionError?.code === "PGRST202" || sessionError?.message.includes("claim_operator_session");
    if (sessionError && !migrationMissing) {
      await supabase.auth.signOut();
      setError("Sesi perangkat gagal diperiksa. Coba lagi.");
      setLoading(false);
      return;
    }
    if (sessionData?.[0]?.session_status === "in_use") {
      await supabase.auth.signOut();
      setError(`Akun TPS ${String(parsed.data.tps).padStart(2, "0")} sedang aktif digunakan di perangkat lain. Coba lagi setelah sekitar 1 menit.`);
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
          {witnesses.map(({ tpsNumber, name }) => (
            <option key={tpsNumber} value={tpsNumber} className="font-bold">TPS {String(tpsNumber).padStart(2, "0")} — {name}</option>
          ))}
        </select>
      </label>
      <PasswordField label="Kata Sandi" />
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p>}
      <button disabled={loading} className="h-16 w-full rounded-xl border-2 border-black bg-white text-lg font-black text-black shadow-[0_5px_0_#101010] active:translate-y-1 active:shadow-none disabled:opacity-60">
        {loading ? "MEMERIKSA..." : "MASUK"}
      </button>
    </form>
  );
}
