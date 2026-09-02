import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { addJobKitLine } from "@/lib/job-kits/service";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await addJobKitLine(await requireRequestContext(), (await params).id, await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}