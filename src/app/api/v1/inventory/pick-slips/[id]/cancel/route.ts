import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { pickSlipCancelInput } from "@/lib/inventory/validation";
import { cancelPickSlip } from "@/lib/inventory/service";

// 2026-09-29 — "Cancel" action on a picking slip (Job Parts list and,
// eventually, Stock Levels' Picking Slip History) — see cancelPickSlip's
// own comment in inventory/service.ts for what reversing a pick slip
// actually does.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await params;
    const ctx = await requireRequestContext();
    return NextResponse.json(await cancelPickSlip(ctx, id, pickSlipCancelInput.parse(await request.json())));
  } catch (e) { return apiError(e); }
}
