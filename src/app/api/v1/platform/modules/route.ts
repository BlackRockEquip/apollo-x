import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { createModuleCatalogEntry, listModuleCatalog, seedModuleCatalogIfEmpty } from "@/lib/platform/module-catalog-service";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRequestContext();
    await seedModuleCatalogIfEmpty(ctx);
    return NextResponse.json(await listModuleCatalog(ctx, Object.fromEntries(request.nextUrl.searchParams)));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await createModuleCatalogEntry(await requireRequestContext(), await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}