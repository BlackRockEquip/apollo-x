import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { getJobsPerCustomerReport, getMonthlyReport, getRatiosReport, getWarrantyBreakdownReport } from "@/lib/reports/service";

// 2026-10-02 — new "Reports" sidebar section. One GET-only route, dispatched
// by `type` the same way master-data's [kind]/route.ts dispatches by kind —
// every report here is read-only (no create/update/delete), so there's no
// POST/PUT/DELETE to wire. `months` is the shared time-window query param
// across every report type (see reports/service.ts's sinceFor); jobs-per-
// customer and monthly additionally take an optional `customerId`.
const REPORT_TYPES = new Set(["jobs-per-customer", "warranty-breakdown", "monthly", "ratios"]);

function parseMonths(request: NextRequest): number | undefined {
  const raw = request.nextUrl.searchParams.get("months");
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  try {
    const ctx = await requireRequestContext();
    const { type } = await params;
    if (!REPORT_TYPES.has(type)) throw new Error("NOT_FOUND");
    const months = parseMonths(request);
    const customerId = request.nextUrl.searchParams.get("customerId") || undefined;

    switch (type) {
      case "jobs-per-customer":
        return NextResponse.json({ rows: await getJobsPerCustomerReport(ctx, { months }) });
      case "warranty-breakdown":
        return NextResponse.json(await getWarrantyBreakdownReport(ctx, { months }));
      case "monthly":
        return NextResponse.json(await getMonthlyReport(ctx, { months, customerId }));
      case "ratios":
        return NextResponse.json({ ratios: await getRatiosReport(ctx, { months }) });
      default:
        throw new Error("NOT_FOUND");
    }
  } catch (error) { return apiError(error); }
}
