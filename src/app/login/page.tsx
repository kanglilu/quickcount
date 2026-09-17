import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";
import Link from "next/link";

export default async function LoginPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/count");

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-[var(--line)] bg-white p-6 shadow-[0_16px_50px_rgba(17,24,19,.08)] sm:p-8">
        <div className="mb-8">
          <p className="mb-2 text-sm font-black uppercase tracking-[.2em] text-black">Hari Penghitungan</p>
          <h1 className="text-4xl font-black tracking-tight">Quick Count</h1>
          <p className="mt-3 leading-relaxed text-neutral-600">Masuk memakai akun TPS yang sudah dibagikan koordinator.</p>
          <Link href="/admin/login" className="mt-3 inline-flex items-center gap-2 rounded-full border border-neutral-400 bg-white px-3 py-1.5 text-sm font-bold text-black hover:border-black">
            <span aria-hidden="true">●</span> Masuk sebagai admin
          </Link>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
