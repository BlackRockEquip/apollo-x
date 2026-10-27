import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { declinePickSlipRequest } from "@/lib/inventory/pick-requests";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(req);
    const { id } = await params;
    let body: unknown = {};
    try { body = await req.json(); } catch { body = {}; }
    return NextResponse.json(await declinePickSlipRequest(await requireRequestContext(), id, body));
  } catch (e) { return apiError(e); }
}
