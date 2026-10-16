import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { getSpecificationFormSettings, saveSpecificationFormSettings } from "@/lib/specifications/service";

// The printed form's document-control block (document number, issue date, revision...).
export async function GET() {
  try {
    return NextResponse.json(await getSpecificationFormSettings(await requireRequestContext()));
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await saveSpecificationFormSettings(await requireRequestContext(), await request.json()));
  } catch (error) {
    return apiError(error);
  }
}
