import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { listPlatformSupportTickets } from "@/lib/support/service";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await listPlatformSupportTickets(await requireRequestContext(), Object.fromEntries(request.nextUrl.searchParams)));
  } catch (error) {
    return apiError(error);
  }
}