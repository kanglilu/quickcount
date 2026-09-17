import type { Metadata, Viewport } from "next";
import { DashboardClient } from "@/app/(protected)/dashboard/dashboard-client";
import { getPublicResults } from "@/lib/public-results";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Hasil Quick Count Cibening 2026",
  description: "Hasil sementara penghitungan suara Kepala Desa Cibening 2026",
  other: {
    "color-scheme": "light only",
    "supported-color-schemes": "light",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#edeee9",
  colorScheme: "light",
};

export default async function PublicResultsPage() {
  const results = await getPublicResults();

  return (
    <DashboardClient
      electionId={results.electionId}
      candidates={results.candidates}
      tpsRows={results.tpsRows}
      initialTotals={results.totals}
      initialGolputTotals={results.golputTotals}
      pollUrl="/api/public-results"
      standalone
    />
  );
}
