import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { getJobAttachmentFile } from "@/lib/jobs/service";

// Returns { fileName, mimeType, contentBase64 } so the client can build a
// data: URL to view or download the attachment — same convention as the
// RFQ quote file download route.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  try {
    const { id, attachmentId } = await params;
    return NextResponse.json(await getJobAttachmentFile(await requireRequestContext(), id, attachmentId));
  } catch (error) {
    return apiError(error);
  }
}
