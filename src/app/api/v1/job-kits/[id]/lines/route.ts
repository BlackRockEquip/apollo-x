import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { addJobKitLine, addJobKitLinesBulk } from "@/lib/job-kits/service";

// Single-line add (has `partId`, from the "search a part / add kit line"
// form) and the bulk paste-or-import add (2026-09-15, user request — has
// `bulkLines` and/or a file trio instead) both land on this same POST, kept
// on one route rather than a new nested one: a `lines/bulk` route.ts would
// sit one folder past this session's device-bridge staging depth limit,
// same as `lines/[lineId]/route.ts` already does.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const id = (await params).id;
    const ctx = await requireRequestContext();
    const body = await request.json();
    const isSingleLine = !!body && typeof body === "object" && "partId" in body && body.partId;
    const result = isSingleLine ? await addJobKitLine(ctx, id, body) : await addJobKitLinesBulk(ctx, id, body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}