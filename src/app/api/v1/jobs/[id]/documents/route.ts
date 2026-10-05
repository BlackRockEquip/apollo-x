import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { saveJobDocument } from "@/lib/jobs/service";

// "Save to job folder" for a generated document. Body: { kind, nameSuffix?, spec }
// (see lib/documents/spec-schema.ts). Renders the PDF and files it under the
// job as "<JOB NUMBER> - <Document title>.pdf".
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await params;
    return NextResponse.json(await saveJobDocument(await requireRequestContext(), id, await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
