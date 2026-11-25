import { NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { getCommissionsOverview } from "@/lib/commissions/service";

// Commissions (2026-11-25): every rep, line, monthly fuel entry and payout for the company, with each rep's months worked out.
export async function GET() {
  try {
    return NextResponse.json(await getCommissionsOverview(await requireRequestContext()));
  } catch (error) {
    return apiError(error);
  }
}
