import { NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { listStorageLocationOptions } from "@/lib/inventory/service";

// 2026-09-16 — lightweight list, scoped to the INVENTORY module, for
// populating location dropdowns inside Stock Levels (Adjust, Add/Edit
// Part's bin location). See listStorageLocationOptions's own comment for
// why this exists alongside master-data's storage-locations endpoint
// rather than reusing it directly.
export async function GET() {
  try {
    return NextResponse.json(await listStorageLocationOptions(await requireRequestContext()));
  } catch (e) { return apiError(e); }
}
