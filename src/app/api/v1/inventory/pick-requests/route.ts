import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { createPickSlipRequest, listPickSlipRequests } from "@/lib/inventory/pick-requests";

// 2026-10-27 — Mechanic view: a mechanic requests a picking slip for in-stock parts (POST); the store team lists the
// requests (GET). See src/lib/inventory/pick-requests.ts.
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const query = { status: url.searchParams.get("status") ?? undefined, page: url.searchParams.get("page") ?? undefined, pageSize: url.searchParams.get("pageSize") ?? undefined };
    return NextResponse.json(await listPickSlipRequests(await requireRequestContext(), query));
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    requireSameOrigin(req);
    return NextResponse.json(await createPickSlipRequest(await requireRequestContext(), await req.json()), { status: 201 });
  } catch (e) { return apiError(e); }
}
