import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { createCommissionLine } from "@/lib/commissions/service";

// POST { salesRepresentativeId, jobId?, jobReference, invoices[], costs[], fuelCharge, otherExpenses, ... } adds an invoiced job.
export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await createCommissionLine(await requireRequestContext(), await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
