import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { ActivityExportError, searchJobsForActivityExport } from "@/lib/activity-export/service";

// GET ?q=&from=&to= — the job picker behind the "Export activity history" card.
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRequestContext();
    return NextResponse.json(await searchJobsForActivityExport(ctx, Object.fromEntries(request.nextUrl.searchParams)));
  } catch (error) {
    if (error instanceof ActivityExportError) {
      return NextResponse.json({ error: { code: "ACTIVITY_EXPORT_ERROR", message: error.message } }, { status: 400 });
    }
    return apiError(error);
  }
}
