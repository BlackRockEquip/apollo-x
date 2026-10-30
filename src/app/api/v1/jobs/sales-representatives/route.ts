import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { listSalesRepresentativeOptions, addSalesRepresentativeOption } from "@/lib/jobs/service";

// 2026-09-22 — lightweight list, scoped to the JOBS_WIP module, for
// populating the "Sales representative" dropdown on the Job view. See
// listSalesRepresentativeOptions's own comment — mirrors
// /api/v1/jobs/mechanics for the same reason (a user with ordinary
// JOBS_VIEW but not separately granted Users admin access shouldn't get a
// silently empty dropdown).
export async function GET() {
  try {
    return NextResponse.json(await listSalesRepresentativeOptions(await requireRequestContext()));
  } catch (e) { return apiError(e); }
}

// 2026-10-30, user request: a name typed on a job that is not in the list is added to it (see addSalesRepresentativeOption).
export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await addSalesRepresentativeOption(await requireRequestContext(), await request.json()), { status: 201 });
  } catch (e) { return apiError(e); }
}
