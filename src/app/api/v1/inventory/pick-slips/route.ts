import { NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { pickSlipCreateInput, pickSlipQuery } from "@/lib/inventory/validation";
import { createPickSlip, listPickSlips } from "@/lib/inventory/service";

// 2026-09-14 — Stock Levels' "Create picking slip" action (POST) and the
// "Picking Slip History" list (GET) — see createPickSlip/listPickSlips in
// inventory/service.ts for what a picking slip actually does (issues real
// stock against the job's own default bin location per part, backordering
// anything short).
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const input = pickSlipQuery.parse({
      page: url.searchParams.get("page") ?? "1",
      pageSize: url.searchParams.get("pageSize") ?? "50",
    });
    return NextResponse.json(await listPickSlips(await requireRequestContext(), input));
  } catch (e) { return apiError(e); }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireRequestContext();
    return NextResponse.json(await createPickSlip(ctx, pickSlipCreateInput.parse(await req.json())), { status: 201 });
  } catch (e) { return apiError(e); }
}
