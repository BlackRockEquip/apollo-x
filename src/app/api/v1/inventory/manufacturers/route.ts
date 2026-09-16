import { NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { listManufacturerOptions } from "@/lib/inventory/service";

// 2026-09-16 — lightweight list, scoped to the INVENTORY module, for
// populating the Manufacturer dropdown inside Stock Levels' Add/Edit Part
// drawer. See listManufacturerOptions's own comment for why this exists
// alongside master-data's manufacturers endpoint rather than reusing it
// directly (mirrors /api/v1/inventory/locations for the same reason).
export async function GET() {
  try {
    return NextResponse.json(await listManufacturerOptions(await requireRequestContext()));
  } catch (e) { return apiError(e); }
}
