import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { mergeSuppliers } from "@/lib/merge/service";

// New — 2026-09-14, the Suppliers screen's "Merge" button. Body:
// { survivingId, losingId }. See mergeSuppliers in merge/service.ts for the
// reassign-then-deactivate behavior.
export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await mergeSuppliers(await requireRequestContext(), await request.json()));
  } catch (error) {
    return apiError(error);
  }
}
