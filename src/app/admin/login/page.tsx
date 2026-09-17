import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminLoginForm } from "./admin-login-form";

export default async function AdminLoginPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return <main className="flex min-h-dvh items-center justify-center px-4 py-10">
    <section className="w-full max-w-md rounded-3xl border border-[var(--line)] bg-white p-6 shadow-[0_16px_50px_rgba(17,24,19,.08)] sm:p-8">
      <p className="mb-2 text-sm font-black uppercase tracking-[.2em] text-black">Akses khusus</p>
      <h1 className="text-4xl font-black tracking-tight">Admin Quick Count</h1>
      <p className="mt-3 text-neutral-600">Masuk untuk memantau dashboard dan riwayat seluruh TPS.</p>
      <div className="mt-8"><AdminLoginForm /></div>
      <Link href="/login" className="mt-5 block text-center text-sm font-bold text-neutral-600">← Kembali ke login petugas</Link>
    </section>
  </main>;
}
