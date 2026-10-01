import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { deleteTenantSupportTicket, getTenantSupportTicket, replyToSupportTicket, updateTenantSupportTicketStatus } from "@/lib/support/service";
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

// 2026-10-01 — user request: "add functionality for org admin to change
// status of support request (Open, In Process, Closed)."
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await updateTenantSupportTicketStatus(await requireRequestContext(), (await params).id, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}

// 2026-10-01 — user request: "add delete button" on the Org Admin ticket table.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await deleteTenantSupportTicket(await requireRequestContext(), (await params).id));
  } catch (error) {
    return apiError(error);
  }
}