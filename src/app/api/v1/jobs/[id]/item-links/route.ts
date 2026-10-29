import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { setJobRecordItem } from "@/lib/jobs/service";

// Engineering multi-item jobs: POST { kind: "part" | "outwork" | "attachment" | "dimension", recordId, itemId | null } ties one
// existing part line / outwork line / photo or file / specification report to an item of the job (null = the whole job).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await params;
    return NextResponse.json(await setJobRecordItem(await requireRequestContext(), id, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}
