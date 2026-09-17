import { AppHeader } from "@/components/app-header";
import { getAuthContext } from "@/lib/auth-context";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { profile, tps } = await getAuthContext();
  return <><AppHeader accountLabel={profile.role === "admin" ? "Admin Media Center Gaskeun" : (tps?.name ?? "TPS")} role={profile.role} />{children}</>;
}
