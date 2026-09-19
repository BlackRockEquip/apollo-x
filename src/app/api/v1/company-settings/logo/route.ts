import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { resolveCompanyLogoSource, updateCompanyLogo } from "@/lib/master-data/company-settings-service";

// 2026-09-14 — the logo's bytes now live in object storage (see
// updateCompanyLogo's own comment), so GET no longer streams bytes itself:
// it resolves a short-lived signed URL and redirects the browser to it.
//
// 2026-09-19 — user report: "Fix logo display as its not pulling through"
// (on the outwork delivery note), then a follow-up: "investigate logo
// display problem throughout the app." This GET used to call the full
// getCompanySettings, gated behind COMPANY_SETTINGS_VIEW — an admin-only
// permission with nothing to do with viewing a company's own logo (already
// shown to every signed-in member in the sidebar) — that part's fixed by
// requireRequestContext() + resolveCompanyLogoSource's own requireTenant.
// The second, deeper bug resolveCompanyLogoSource fixes: a company whose
// logo predates the 2026-09-14 object-storage migration and was never
// re-uploaded since has no Attachment row at all (no backfill was ever
// run — see that function's own comment), so this route 404'd for it even
// after the permission fix, while the sidebar (which reads the legacy
// bytes directly) kept working. See resolveCompanyLogoSource's own comment
// in company-settings-service.ts for the full root cause and fix.
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRequestContext();
    const source = await resolveCompanyLogoSource(ctx);
    if (source.kind === "none") return new NextResponse(null, { status: 404 });
    if (source.kind === "redirect") return NextResponse.redirect(new URL(source.url, request.url));
    // Legacy inline bytes — see resolveCompanyLogoSource's comment. Short
    // cache so a shared/kiosk browser doesn't hold onto a stale logo for
    // long, but avoids re-fetching identical bytes on every navigation.
    // source.data is a genuine ArrayBuffer (see resolveCompanyLogoSource's
    // own comment on toArrayBuffer — two Render TS build failures in a row
    // came from Buffer not structurally satisfying BodyInit/BlobPart), so
    // it's passed straight through here with no wrapping needed.
    return new NextResponse(source.data, { headers: { "content-type": source.mimeType, "cache-control": "private, max-age=300" } });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await updateCompanyLogo(await requireRequestContext(), await request.json()));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await updateCompanyLogo(await requireRequestContext(), null));
  } catch (error) {
    return apiError(error);
  }
}