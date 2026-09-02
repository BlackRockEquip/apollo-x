import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { applyJobKitToJob } from "@/lib/job-kits/service";
import { jobKitApplyInput } from "@/lib/job-kits/validation";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const body = jobKitApplyInput.parse(await request.json());
    return NextResponse.json(await applyJobKitToJob(await requireRequestContext(), (await params).id, body.kitId));
  } catch (error) {
    return apiError(error);
  }
}