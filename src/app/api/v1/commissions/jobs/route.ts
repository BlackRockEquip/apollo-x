import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { searchJobsForCommissions } from "@/lib/commissions/service";

// GET ?q=… job lookup for the Commissions line dialog.
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await searchJobsForCommissions(await requireRequestContext(), request.nextUrl.searchParams.get("q") ?? ""));
  } catch (error) {
    return apiError(error);
  }
}
