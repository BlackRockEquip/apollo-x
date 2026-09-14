import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { getCompanySettings, updateCompanyLogo } from "@/lib/master-data/company-settings-service";
import { getAttachmentDownloadUrl } from "@/lib/attachments/service";
import { prisma } from "@/lib/prisma";

// 2026-09-14 — the logo's bytes now live in object storage (see
// updateCompanyLogo's own comment), so GET no longer streams bytes itself:
// it resolves a short-lived signed URL and redirects the browser to it.
// requireRequestContext()/getCompanySettings() still run first, so this
// stays exactly as private as the old inline-bytes response was — the
// signed URL is only ever handed to an already-authorized, already
// company-scoped caller, same as every other use of
// getAttachmentDownloadUrl.
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRequestContext();
    const data = await getCompanySettings(ctx);
    const settings = data.settings as Record<string, unknown> | null;
    if (!settings?.logoMimeType) return new NextResponse(null, { status: 404 });
    const companyId = ctx.companyId!;
    const attachment = await prisma.attachment.findFirst({ where: { companyId, ownerType: "COMPANY_LOGO", ownerId: companyId } });
    if (!attachment) return new NextResponse(null, { status: 404 });
    const signedUrl = await getAttachmentDownloadUrl(attachment);
    return NextResponse.redirect(new URL(signedUrl, request.url));
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