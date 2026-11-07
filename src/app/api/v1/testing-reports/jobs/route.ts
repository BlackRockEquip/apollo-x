import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { searchJobsForTesting } from "@/lib/testing/service";

// Job lookup for "New test". Needs Testing Reports access only (a Testing Technician has no Jobs access).
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await searchJobsForTesting(await requireRequestContext(), request.nextUrl.searchParams.get("q") ?? ""));
  } catch (error) {
    return apiError(error);
  }
}
