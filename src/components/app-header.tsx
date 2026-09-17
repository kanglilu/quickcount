"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AppHeader({ accountLabel, role }: { accountLabel: string; role: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const links = role === "admin"
    ? [{ href: "/dashboard", label: "Dashboard" }, { href: "/monitoring", label: "Monitoring" }, { href: "/history", label: "Riwayat" }]
    : [{ href: "/count", label: "Penghitungan" }];

  async function logout() {
    const supabase = createClient();
    if (role === "witness") {
      await supabase.rpc("report_operator_status", { p_is_online: false, p_current_page: "/count" });
    }
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 border-b border-neutral-800 bg-black text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-1.5 md:gap-3 md:px-4 md:py-3">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[.14em] text-white/60 md:text-xs">{role === "admin" ? "Administrator" : "Petugas Aktif"}</p>
          <p className="text-sm font-black md:text-lg">{accountLabel}</p>
        </div>
        <button onClick={logout} className="rounded-lg border border-white/30 bg-white/10 px-2.5 py-1.5 text-xs font-bold text-white md:px-3 md:py-2 md:text-sm">Keluar</button>
      </div>
      <nav className="mx-auto flex max-w-6xl overflow-x-auto px-2 md:px-4" aria-label="Menu utama">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className={`whitespace-nowrap border-b-[3px] px-3 py-2 text-xs font-bold md:border-b-4 md:px-4 md:py-3 md:text-sm ${pathname === link.href ? "border-white text-white" : "border-transparent text-white/55"}`}>
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
