import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { listCustomerJobs } from "@/lib/master-data/party-service";

// The Jobs section on a customer's page (2026-10-29 redesign): work received from them and what has gone back. Read-only.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRequestContext();
    return NextResponse.json(await listCustomerJobs(ctx, (await params).id, Object.fromEntries(request.nextUrl.searchParams)));
  } catch (error) {
    return apiError(error);
  }
}
