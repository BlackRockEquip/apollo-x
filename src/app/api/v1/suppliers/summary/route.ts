import { NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { supplierListSummary } from "@/lib/master-data/party-service";

// Tiles above the Suppliers list (2026-10-29 redesign). Read-only.
export async function GET() {
  try {
    return NextResponse.json(await supplierListSummary(await requireRequestContext()));
  } catch (error) {
    return apiError(error);
  }
}
