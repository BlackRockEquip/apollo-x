import { NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { failureReportSuggestions } from "@/lib/failure-reports/service";

// Earlier values per field (clients, sites, components, list lines ...) from the company's own reports, offered while typing.
export async function GET() {
  try {
    return NextResponse.json(await failureReportSuggestions(await requireRequestContext()));
  } catch (error) {
    return apiError(error);
  }
}
