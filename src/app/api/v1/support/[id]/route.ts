import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { getTenantSupportTicket, replyToSupportTicket } from "@/lib/support/service";
import { requireSameOrigin } from "@/lib/security/request";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json(await getTenantSupportTicket(await requireRequestContext(), (await params).id));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await replyToSupportTicket(await requireRequestContext(), (await params).id, await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}