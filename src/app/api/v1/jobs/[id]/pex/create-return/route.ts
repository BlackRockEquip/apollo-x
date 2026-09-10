import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { createPexReturnJob } from "@/lib/pex/service";

// "Create linked return job now" — server-side backstop button on a
// PEX_SUPPLY job that has no return job yet. Mirrors ModApp's own manual
// createPexReturnJob action (also used as the auto-trigger on completion,
// via createAndAttachReturnJobTx in pex/service.ts).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await params;
    return NextResponse.json(await createPexReturnJob(await requireRequestContext(), id), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
