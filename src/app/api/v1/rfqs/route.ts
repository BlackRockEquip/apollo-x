import { NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { listAllRfqRequests } from "@/lib/rfq/service";

// New — 2026-09-14, Suppliers screen's RFQ tab: every RFQ across every job
// (JobRfqRequest) plus every job-less general RFQ (GeneralRfqRequest),
// merged newest-first. Creating a job-linked RFQ still goes through
// POST /api/v1/jobs/[id]/rfq (from that job); creating a job-less one goes
// through POST /api/v1/rfqs/general (see that route).
export async function GET() {
  try {
    return NextResponse.json({ items: await listAllRfqRequests(await requireRequestContext()) });
  } catch (error) {
    return apiError(error);
  }
}
