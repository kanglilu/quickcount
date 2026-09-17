import { NextResponse } from "next/server";
import { getPublicResults } from "@/lib/public-results";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const results = await getPublicResults();
    return NextResponse.json(results, {
      headers: {
        "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20",
      },
    });
  } catch (error) {
    console.error("Public results error", error);
    return NextResponse.json({ error: "Data hasil belum tersedia." }, { status: 503 });
  }
}
