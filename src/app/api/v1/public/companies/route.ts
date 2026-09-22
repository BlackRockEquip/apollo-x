import { NextResponse } from "next/server";
import { apiError } from "@/lib/http/errors";
import { listPublicCompanyLogos } from "@/lib/master-data/company-settings-service";

// 2026-09-22 — public, unauthenticated: powers the "companies on the
// platform" logo strip on the login page (PlatformCompaniesStrip.tsx).
// See listPublicCompanyLogos's own comment for exactly what's exposed
// here and why it's deliberately limited to id/name.
export async function GET() {
  try {
    return NextResponse.json({ companies: await listPublicCompanyLogos() });
  } catch (error) {
    return apiError(error);
  }
}
