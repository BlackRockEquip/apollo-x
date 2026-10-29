import { NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { customerListSummary } from "@/lib/master-data/party-service";

// Tiles above the Customers list (2026-10-29 redesign). Read-only.
export async function GET() {
  try {
    return NextResponse.json(await customerListSummary(await requireRequestContext()));
  } catch (error) {
    return apiError(error);
  }
}
