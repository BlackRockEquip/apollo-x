import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { addMachineMakeToManufacturers } from "@/lib/jobs/service";

// 2026-10-22, user request: a Machine make that is not in the manufacturers list is added to it (see addMachineMakeToManufacturers).
export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await addMachineMakeToManufacturers(await requireRequestContext(), await request.json()));
  } catch (error) { return apiError(error); }
}
