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
    // 2026-09-15 fix, found while wiring up the new analytics charts: this
    // used to pass `(await request.json()).widgets` — but the frontend
    // (DashboardSettingsWorkspace.tsx) has always POSTed the widgets array
    // itself as the whole body, not wrapped in `{ widgets: ... }`, so
    // `.widgets` on that array was always undefined and every save quietly
    // fell back to the default layout. Now sends the whole parsed body
    // through — saveDashboardConfig accepts either shape (see its own
    // comment), and the frontend now sends `{ widgets, analyticsCharts }`.
    return NextResponse.json(await saveDashboardConfig(await requireRequestContext(), await request.json()));
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