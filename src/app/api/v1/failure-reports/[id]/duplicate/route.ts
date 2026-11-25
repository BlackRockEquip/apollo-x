import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { duplicateFailureReport } from "@/lib/failure-reports/service";

// POST: a new report as a copy of this one (photos, marks and text included).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await params;
    return NextResponse.json(await duplicateFailureReport(await requireRequestContext(), id), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
