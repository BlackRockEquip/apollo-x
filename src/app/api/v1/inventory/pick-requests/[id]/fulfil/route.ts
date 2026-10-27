import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { fulfilPickSlipRequest } from "@/lib/inventory/pick-requests";

// Creates the real picking slip from a pending request (store controller / manager / admin).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(req);
    const { id } = await params;
    return NextResponse.json(await fulfilPickSlipRequest(await requireRequestContext(), id), { status: 201 });
  } catch (e) { return apiError(e); }
}
