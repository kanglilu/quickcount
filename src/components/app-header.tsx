"use client";

import { useState, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getDeviceId } from "@/lib/device-session";

export function AppHeader({ accountLabel, role }: { accountLabel: string; role: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [navigationTarget, setNavigationTarget] = useState<string | null>(null);
  const links = role === "admin"
    ? [{ href: "/dashboard", label: "Dashboard" }, { href: "/monitoring", label: "Monitoring" }, { href: "/history", label: "Riwayat" }]
    : [{ href: "/count", label: "Penghitungan" }];

  function handleNavigation(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || pathname === href) return;
    setNavigationTarget(href);
  }

  async function logout() {
    const supabase = createClient();
    if (role === "witness") {
      const { error } = await supabase.rpc("release_operator_session", { p_device_id: getDeviceId() });
      if (error?.code === "PGRST202" || error?.message.includes("release_operator_session")) {
        await supabase.rpc("report_operator_status", { p_is_online: false, p_current_page: "/count" });
      }
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
          <Link key={link.href} href={link.href} onClick={(event) => handleNavigation(event, link.href)} className={`whitespace-nowrap border-b-[3px] px-3 py-2 text-xs font-bold md:border-b-4 md:px-4 md:py-3 md:text-sm ${pathname === link.href ? "border-white text-white" : "border-transparent text-white/55"}`}>
            {link.label}
          </Link>
        ))}
      </nav>
      {role === "admin" && navigationTarget !== null && pathname !== navigationTarget && (
        <div role="status" aria-live="polite" className="fixed left-1/2 top-24 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-black/90 px-4 py-2 text-xs font-black text-white shadow-2xl backdrop-blur md:top-28 md:text-sm">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" aria-hidden="true" />
          Memuat halaman...
        </div>
      )}
    </header>
  );
}
