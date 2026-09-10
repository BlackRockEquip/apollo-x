import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { listUnlinkedPexReturnJobs } from "@/lib/pex/service";

// Search for an active PEX_RETURN job with no PexRecord linked yet, to feed
// the "link an existing return job" combobox on a PEX_SUPPLY job's page.
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await listUnlinkedPexReturnJobs(await requireRequestContext(), Object.fromEntries(request.nextUrl.searchParams)));
  } catch (error) {
    return apiError(error);
  }
}
