import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { createSupportTicket, listTenantSupportTickets, requestMetaFrom } from "@/lib/support/service";

export async function GET() {
  try {
    return NextResponse.json(await listTenantSupportTickets(await requireRequestContext()));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await createSupportTicket(await requireRequestContext(), await request.json(), requestMetaFrom(request)), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}