import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { mergeManufacturers } from "@/lib/merge/service";

// New — 2026-09-28, the Manufacturers screen's "Merge" button ("add a Merge
// button if there are duplicates"). Body: { survivingId, losingId }. See
// mergeManufacturers in merge/service.ts for the reassign-then-deactivate
// behavior — mirrors src/app/api/v1/suppliers/merge/route.ts exactly.
export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await mergeManufacturers(await requireRequestContext(), await request.json()));
  } catch (error) {
    return apiError(error);
  }
}
