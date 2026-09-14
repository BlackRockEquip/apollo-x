import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { addJobAttachment } from "@/lib/jobs/service";

// New — attachments (see schema.prisma's JobAttachment comment). Body:
// { fileName, mimeType, contentBase64, notes? }. Stored inline, 8MB cap,
// allow-listed mime types — see addJobAttachment in jobs/service.ts.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await params;
    return NextResponse.json(await addJobAttachment(await requireRequestContext(), id, await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
