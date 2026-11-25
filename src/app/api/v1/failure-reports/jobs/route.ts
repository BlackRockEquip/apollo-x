import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { searchJobsForReports } from "@/lib/failure-reports/service";

// Job lookup for linking a report to a job (?q=job number, component, model, serial, plant or client).
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await searchJobsForReports(await requireRequestContext(), request.nextUrl.searchParams.get("q") ?? ""));
  } catch (error) {
    return apiError(error);
  }
}
