import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { deleteJobAttachment } from "@/lib/jobs/service";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  try {
    requireSameOrigin(request);
    const { id, attachmentId } = await params;
    return NextResponse.json(await deleteJobAttachment(await requireRequestContext(), id, attachmentId));
  } catch (error) {
    return apiError(error);
  }
}
