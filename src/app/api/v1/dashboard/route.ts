import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { getDashboardConfig, getDashboardData, resetDashboardConfig, saveDashboardConfig } from "@/lib/dashboard/service";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRequestContext();
    if (request.nextUrl.searchParams.get("mode") === "config") return NextResponse.json(await getDashboardConfig(ctx));
    return NextResponse.json(await getDashboardData(ctx));
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await saveDashboardConfig(await requireRequestContext(), (await request.json()).widgets));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await resetDashboardConfig(await requireRequestContext()));
  } catch (error) {
    return apiError(error);
  }
}