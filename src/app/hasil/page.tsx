import { DashboardClient } from "@/app/(protected)/dashboard/dashboard-client";
import { getPublicResults } from "@/lib/public-results";

export const dynamic = "force-dynamic";

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
