import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { renderJobDocumentForDownload } from "@/lib/jobs/service";

// New — 2026-10-13: builds a job document's PDF (same as "save to the job
// folder") but only returns it, so the browser can save it to the user's own
// computer. Body: { jobId, kind, nameSuffix?, spec }.
export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const body = await request.json();
    return NextResponse.json(await renderJobDocumentForDownload(await requireRequestContext(), String(body?.jobId || ""), body));
  } catch (error) {
    return apiError(error);
  }
}
