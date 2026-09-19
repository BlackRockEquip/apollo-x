import { NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { getCompanyPrintDetails } from "@/lib/master-data/company-settings-service";

// 2026-09-19 — lightweight, non-admin-gated company details (name, address,
// VAT, registration number, contact, email) for printed documents like the
// outwork delivery note. See getCompanyPrintDetails's own comment for why
// this exists rather than reusing /api/v1/company-settings (that route's
// own GET requires COMPANY_SETTINGS_VIEW, an admin-only permission).
export async function GET() {
  try {
    return NextResponse.json(await getCompanyPrintDetails(await requireRequestContext()));
  } catch (e) { return apiError(e); }
}
