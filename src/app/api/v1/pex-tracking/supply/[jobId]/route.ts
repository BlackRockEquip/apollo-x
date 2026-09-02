import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { getPexSupplyLinkBySupplyJobId, linkPexSupplyJob, cancelPexSupplyLink, relinkPexSupplyChain } from "@/lib/pex/service";
import { requireSameOrigin } from "@/lib/security/request";

export async function GET(_: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    return NextResponse.json(await getPexSupplyLinkBySupplyJobId(await requireRequestContext(), (await params).jobId));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await linkPexSupplyJob(await requireRequestContext(), (await params).jobId, await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await relinkPexSupplyChain(await requireRequestContext(), (await params).jobId, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await cancelPexSupplyLink(await requireRequestContext(), (await params).jobId, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}