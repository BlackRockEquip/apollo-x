import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/http/errors";
import { resolvePublicCompanyLogoSource } from "@/lib/master-data/company-settings-service";

// 2026-09-22 — public, unauthenticated counterpart of
// /api/v1/company-settings/logo, scoped by an explicit company id instead
// of the caller's own session — see resolvePublicCompanyLogoSource's
// comment for what's deliberately restricted here (ACTIVE companies only,
// only when a logo is actually set).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const source = await resolvePublicCompanyLogoSource(id);
    if (source.kind === "none") return new NextResponse(null, { status: 404 });
    if (source.kind === "redirect") return NextResponse.redirect(new URL(source.url, request.url));
    return new NextResponse(source.data, { headers: { "content-type": source.mimeType, "cache-control": "public, max-age=300" } });
  } catch (error) {
    return apiError(error);
  }
}
