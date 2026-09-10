import { NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { getPlatformOverview } from "@/lib/platform/admin-service";

export async function GET() {
  try {
    return NextResponse.json(await getPlatformOverview(await requireRequestContext()));
  } catch (error) {
    return apiError(error);
  }
}