import { AppHeader } from "@/components/app-header";
import { getAuthContext } from "@/lib/auth-context";
import { getWitnessName } from "@/lib/witnesses";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { profile, tps } = await getAuthContext();
  const accountLabel = profile.role === "admin"
    ? "Admin Media Center Gaskeun"
    : `${tps?.name ?? "TPS"} · ${tps ? getWitnessName(tps.tps_number) : "Petugas TPS"}`;
  return <><AppHeader accountLabel={accountLabel} role={profile.role} />{children}</>;
}
