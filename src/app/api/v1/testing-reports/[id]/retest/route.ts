import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { retestTestReport } from "@/lib/testing/service";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await params;
    return NextResponse.json(await retestTestReport(await requireRequestContext(), id), { status: 200 });
  } catch (error) {
    return apiError(error);
  }
}
