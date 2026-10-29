import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { listSupplierOutwork } from "@/lib/master-data/party-service";

// The Jobs section on a supplier's page (2026-10-29 redesign): outwork sent to them and what has come back. Read-only.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRequestContext();
    return NextResponse.json(await listSupplierOutwork(ctx, (await params).id, Object.fromEntries(request.nextUrl.searchParams)));
  } catch (error) {
    return apiError(error);
  }
}
