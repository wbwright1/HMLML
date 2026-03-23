import { NextRequest, NextResponse } from "next/server";
import { generateValidationReport } from "@/lib/sync/legacy-validation";

export async function GET(request: NextRequest) {
  // Verify CRON_SECRET for authorization
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const report = await generateValidationReport();

    return NextResponse.json({
      ok: true,
      report,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[legacy-validate] API: Unhandled error:", message);
    return NextResponse.json(
      { error: "Validation failed", message },
      { status: 500 }
    );
  }
}
