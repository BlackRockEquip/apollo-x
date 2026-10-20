import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { deleteProposal, getProposal, setProposalStatus, updateProposal } from "@/lib/proposals/service";

// 2026-10-21 — one proposal: GET reads, PUT saves the whole proposal, PATCH { status } moves it Draft/Sent/Accepted/Declined, DELETE removes it.
type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    return NextResponse.json(await getProposal(await requireRequestContext(), (await params).id));
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await updateProposal(await requireRequestContext(), (await params).id, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await setProposalStatus(await requireRequestContext(), (await params).id, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    requireSameOrigin(request);
    await deleteProposal(await requireRequestContext(), (await params).id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
