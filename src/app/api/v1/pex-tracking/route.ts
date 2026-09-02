import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { listPexSupplyLinks } from "@/lib/pex/service";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await listPexSupplyLinks(await requireRequestContext(), Object.fromEntries(request.nextUrl.searchParams)));
  } catch (error) {
    return apiError(error);
  }
}