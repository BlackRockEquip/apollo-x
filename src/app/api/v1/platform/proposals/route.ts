import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { PROPOSAL_STATUSES, type ProposalStatusValue } from "@/lib/proposals/model";
import { createProposal, listProposals } from "@/lib/proposals/service";

// 2026-10-21 — Platform > Proposals. GET ?status=DRAFT|SENT|ACCEPTED|DECLINED lists; POST { data, demoRequestId? } saves a new draft.
export async function GET(request: NextRequest) {
  try {
    const status = request.nextUrl.searchParams.get("status");
    const filter = status && (PROPOSAL_STATUSES as readonly string[]).includes(status) ? (status as ProposalStatusValue) : undefined;
    return NextResponse.json({ proposals: await listProposals(await requireRequestContext(), filter) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await createProposal(await requireRequestContext(), await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
