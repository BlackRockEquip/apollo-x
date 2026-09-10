import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { addPlatformSupportMessage, getPlatformSupportTicket, updatePlatformSupportTicket } from "@/lib/support/service";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json(await getPlatformSupportTicket(await requireRequestContext(), (await params).id));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await updatePlatformSupportTicket(await requireRequestContext(), (await params).id, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await addPlatformSupportMessage(await requireRequestContext(), (await params).id, await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}