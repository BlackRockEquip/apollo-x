import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { listMechanicOptions, addMechanicOption } from "@/lib/jobs/service";

// 2026-09-19 — lightweight list, scoped to the JOBS_WIP module, for
// populating the "Mechanic Strip"/"Mechanic Assemble" dropdowns on the Job
// view. See listMechanicOptions's own comment for why this exists rather
// than reusing /api/v1/users (mirrors /api/v1/inventory/locations for the
// same reason).
export async function GET() {
  try {
    return NextResponse.json(await listMechanicOptions(await requireRequestContext()));
  } catch (e) { return apiError(e); }
}

// 2026-10-30, user request: a name typed on a job that is not in the list is added to it (see addMechanicOption).
export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await addMechanicOption(await requireRequestContext(), await request.json()), { status: 201 });
  } catch (e) { return apiError(e); }
}
