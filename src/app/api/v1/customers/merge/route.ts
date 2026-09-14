import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { mergeCustomers } from "@/lib/merge/service";

// New — 2026-09-14, the Customers screen's "Merge" button. Body:
// { survivingId, losingId }. See mergeCustomers in merge/service.ts for the
// reassign-then-deactivate behavior.
export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await mergeCustomers(await requireRequestContext(), await request.json()));
  } catch (error) {
    return apiError(error);
  }
}
