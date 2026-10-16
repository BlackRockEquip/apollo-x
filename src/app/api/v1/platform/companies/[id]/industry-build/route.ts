import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { getCompanyIndustryBuild, saveCompanyIndustryBuild } from "@/lib/platform/industry-build-service";

// 2026-10-16 — Platform > Companies > company > Industry build. GET returns the
// build, every build's tiles and this company's state per tile; PATCH saves the
// whole tab (build + each tile on/off + licensing) in one transaction.
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json(await getCompanyIndustryBuild(await requireRequestContext(), (await params).id));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await saveCompanyIndustryBuild(await requireRequestContext(), (await params).id, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}
