import { NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { listJobKitManufacturerOptions } from "@/lib/job-kits/service";

// 2026-09-19 — lightweight list, scoped to JOB_KITS_VIEW (the same
// permission that already gates this whole page), for populating the
// Manufacturer dropdown on the Create/Edit job kit form. See
// listJobKitManufacturerOptions's own comment in job-kits/service.ts for
// why this exists alongside the inventory and master-data manufacturers
// endpoints rather than reusing either of them directly.
export async function GET() {
  try {
    return NextResponse.json(await listJobKitManufacturerOptions(await requireRequestContext()));
  } catch (e) {
    return apiError(e);
  }
}
