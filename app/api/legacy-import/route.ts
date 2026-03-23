import { NextRequest, NextResponse } from "next/server";
import { runLegacyImport } from "@/lib/sync/legacy-import";
import { generateValidationReport } from "@/lib/sync/legacy-validation";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  // Verify CRON_SECRET for authorization
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("[legacy-import] API: Starting legacy import...");

    // Allow importing from a specific league ID (e.g., a disconnected legacy chain)
    const leagueId = request.nextUrl.searchParams.get("leagueId") ?? undefined;
    const importSummary = await runLegacyImport(leagueId);

    // Also generate a validation report after import
    const validationReport = await generateValidationReport();

    const allFailed =
      importSummary.seasonsDiscovered > 0 &&
      importSummary.seasonsFailed === importSummary.seasonsDiscovered;

    if (allFailed) {
      return NextResponse.json(
        {
          error: "All season imports failed",
          importSummary,
          validationReport,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      importSummary,
      validationReport,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[legacy-import] API: Unhandled error:", message);
    return NextResponse.json(
      { error: "Legacy import failed", message },
      { status: 500 }
    );
  }
}
