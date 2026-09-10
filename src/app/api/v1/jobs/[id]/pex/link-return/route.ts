import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { linkPexReturnJob, unlinkPexReturnJob } from "@/lib/pex/service";

// POST { returnJobId } links an existing unlinked, active PEX_RETURN job to
// this PEX_SUPPLY job's PexRecord. DELETE unlinks it (resets to
// TO_BE_DELIVERED, does not delete the return job) — mirrors ModApp's
// LinkPexReturnJobForm / UnlinkPexReturnJobButton pair.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await params;
    return NextResponse.json(await linkPexReturnJob(await requireRequestContext(), id, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await params;
    return NextResponse.json(await unlinkPexReturnJob(await requireRequestContext(), id));
  } catch (error) {
    return apiError(error);
  }
}
