import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { RequestContext } from "@/lib/auth/context-types";
import { requireModule, requireTenant, requireTenantPermission } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { deleteAttachment, getAttachmentDownloadUrl, storeAttachment } from "@/lib/attachments/service";
const text = z.string().trim().max(500).optional().nullable();
const color = z.string().trim().regex(/^#?[0-9a-fA-F]{6}$/).optional().nullable().or(z.literal(""));
// SMTP fields — added 2026-09-09 so a Company Administrator can enter their
// own outbound-email credentials under Settings (see lib/email.ts and the
// "Email / SMTP" section of CompanySettingsForm.tsx), mirroring ModApp's
// own per-company SMTP settings. smtpPassword is write-only: an omitted or
// blank value here means "leave the stored password unchanged" — see
// updateCompanySettings below — and getCompanySettings never returns the
// real value, only a `smtpConfigured` boolean.
export const settingsInput = z.object({ legalName: z.string().trim().min(2).max(200), tradingName: text, registrationNumber: text, vatNumber: text, mainTelephone: text, mainEmail: z.string().trim().email().optional().nullable().or(z.literal("")), website: text, defaultCurrencyCode: z.string().trim().length(3), defaultTaxJurisdiction: z.string().trim().length(2), defaultTaxCodeId: z.string().cuid().optional().nullable(), defaultPaymentTermId: z.string().cuid().optional().nullable(), quoteValidityDays: z.number().int().min(1).max(365), themeColor: color, accentColor: color, secondaryColor: color, documentHeaderText: text, documentFooterText: z.string().trim().max(2000).optional().nullable(), smtpHost: text, smtpPort: z.number().int().min(1).max(65535).optional().nullable(), smtpSecure: z.boolean().optional(), smtpUsername: text, smtpPassword: z.string().trim().max(500).optional().nullable(), smtpFromAddress: z.string().trim().email().optional().nullable().or(z.literal("")), smtpFromName: text });
function normalizeColor(value?: string | null) { const trimmed = value?.trim(); if (!trimmed) return null; return trimmed.startsWith("#") ? trimmed.toUpperCase() : `#${trimmed.toUpperCase()}`; }
function auth(ctx: RequestContext, intent: "READ" | "WRITE") { requireModule(ctx, "DASHBOARD", intent); requireTenantPermission(ctx, intent === "READ" ? "COMPANY_SETTINGS_VIEW" : "COMPANY_SETTINGS_EDIT"); return ctx.companyId!; }
export async function getCompanySettings(ctx: RequestContext) {
  const companyId = auth(ctx, "READ");
  const company = await prisma.company.findFirstOrThrow({ where: { id: companyId }, select: { internalCode: true, legalName: true, tradingName: true, settings: true, addresses: true } });
  const s = company.settings;
  const smtpConfigured = !!(s?.smtpHost && s?.smtpUsername && s?.smtpPassword && s?.smtpFromAddress);
  return { ...company, settings: s ? { ...s, smtpPassword: undefined, smtpConfigured } : s };
}

// 2026-09-19 — user report: "Fix logo display as its not pulling through"
// on the outwork delivery note (and, it turns out, anywhere else something
// other than AppShell's own sidebar <Image> tries to show it). Root cause:
// GET /api/v1/company-settings/logo called the full getCompanySettings
// above, gated behind COMPANY_SETTINGS_VIEW — an admin-only permission
// that has nothing to do with viewing a company's own logo. A logo isn't
// sensitive settings data; it's the same branding image already shown to
// every signed-in member of the company in the sidebar. A user without
// that separate admin permission got a silent 403 on the logo route
// itself — same permission-scoping mismatch bug class already fixed for
// manufacturers/storage locations/the procurement dashboard widget. This
// lightweight check only confirms the caller belongs to a company
// (requireTenant) — no admin permission required.
export async function getCompanyLogoInfo(ctx: RequestContext) {
  requireTenant(ctx);
  const companyId = ctx.companyId!;
  const settings = await prisma.companySettings.findUnique({ where: { companyId }, select: { logoMimeType: true } });
  return { hasLogo: !!settings?.logoMimeType, companyId };
}

// 2026-09-19 — user report: "investigate logo display problem throughout
// the app." Root cause found beyond the permission/CORS fix above: the
// 2026-09-14 object-storage migration deliberately did NOT backfill
// existing logos (see decision-storage-architecture doc's "No backfill of
// historical inline rows planned" — a scope decision, not an oversight).
// A company that set its logo BEFORE that migration and hasn't re-uploaded
// it since still has logoMimeType/logoData set on CompanySettings, but
// updateCompanyLogo's object-storage path — the only thing that ever
// creates a COMPANY_LOGO Attachment row — never ran for it. So
// findLogoAttachment finds nothing for that company, and every consumer
// that only checked the Attachment row (the logo route after this
// session's earlier fix, and the favicon route, which still calls the
// old admin-gated getCompanySettings below on top of this) quietly 404s —
// while the sidebar's logo (src/app/(tenant)/layout.tsx) kept working the
// whole time, because it reads CompanySettings.logoData directly rather
// than going through either route. That's the "works in the sidebar, not
// anywhere else" pattern behind this report.
//
// Fix: resolve the logo the same way everywhere, attachment-first with a
// fallback to the legacy inline bytes instead of a bare 404 — no backfill
// migration needed, and once a company re-uploads its logo (going through
// updateCompanyLogo) the Attachment row exists and this naturally prefers
// it from then on.
export type CompanyLogoSource =
  | { kind: "redirect"; url: string }
  | { kind: "inline"; mimeType: string; data: ArrayBuffer }
  | { kind: "none" };

// 2026-09-19 — two build failures in a row on Render (not catchable from
// this session — no local `next build`/TypeScript toolchain to run it
// against). First: NextResponse's body type wants BodyInit, and a raw
// Buffer doesn't structurally satisfy it, so the caller wrapped it in a
// Blob. Second (this fix): Blob's own BlobPart type turned out to be just
// as picky — Buffer's `.buffer` is typed `ArrayBufferLike`
// (ArrayBuffer | SharedArrayBuffer), not the plain `ArrayBuffer` newer
// lib.dom.d.ts requires. Fixed at the source instead of patching each
// caller again: this function now returns a genuine `ArrayBuffer` — built
// by copying the bytes into a freshly allocated one, whose type is
// unambiguously `ArrayBuffer` with no generic to get wrong — so every
// caller (logo route, favicon route) just works with it directly.
function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(arrayBuffer).set(buffer);
  return arrayBuffer;
}

export async function resolveCompanyLogoSource(ctx: RequestContext): Promise<CompanyLogoSource> {
  requireTenant(ctx);
  const companyId = ctx.companyId!;
  const settings = await prisma.companySettings.findUnique({ where: { companyId }, select: { logoMimeType: true, logoData: true } });
  if (!settings?.logoMimeType) return { kind: "none" };
  const attachment = await prisma.attachment.findFirst({ where: { companyId, ownerType: "COMPANY_LOGO", ownerId: companyId } });
  if (attachment) {
    // 2026-09-19 — user report: "local dev is working well with logos but
    // online render still not showing logo." getAttachmentDownloadUrl
    // defaults to Content-Disposition: attachment (right for a real
    // download like an RFQ quote file), which forces a "Save As" download
    // instead of rendering wherever this URL is used as an image — the
    // sidebar, print letterheads, the favicon. Confirmed directly: opening
    // the logo route's URL in a browser downloaded the file instead of
    // displaying it. "inline" here is the fix — see
    // StorageBackend.getSignedDownloadUrl's comment in
    // src/lib/storage/types.ts for the full root cause.
    const url = await getAttachmentDownloadUrl(attachment, undefined, "inline");
    return { kind: "redirect", url };
  }
  if (settings.logoData) return { kind: "inline", mimeType: settings.logoMimeType, data: toArrayBuffer(Buffer.from(settings.logoData)) };
  return { kind: "none" };
}

// 2026-09-19 — user request: print the company's own organization details
// (name, address, VAT, registration number, contact, email) on the outwork
// delivery note. Same reasoning as getCompanyLogoInfo above: this is
// letterhead-style information that belongs on anything printed for a
// company's own staff or a supplier, not admin-only settings, so it's
// gated the same lightweight way rather than reusing getCompanySettings's
// COMPANY_SETTINGS_VIEW gate (which would silently blank this out for
// anyone printing a delivery note without also holding that separate admin
// permission).
export async function getCompanyPrintDetails(ctx: RequestContext) {
  requireTenant(ctx);
  const companyId = ctx.companyId!;
  const company = await prisma.company.findFirstOrThrow({
    where: { id: companyId },
    select: {
      legalName: true,
      tradingName: true,
      settings: { select: { registrationNumber: true, vatNumber: true, mainTelephone: true, mainEmail: true } },
      addresses: { orderBy: [{ isPrimary: "desc" }, { type: "asc" }], take: 1 },
    },
  });
  const address = company.addresses[0] ?? null;
  const addressLines = address
    ? [address.line1, address.line2, address.city, address.province, address.postalCode].filter((v): v is string => Boolean(v && v.trim()))
    : [];
  return {
    name: company.tradingName || company.legalName,
    addressLines,
    registrationNumber: company.settings?.registrationNumber ?? null,
    vatNumber: company.settings?.vatNumber ?? null,
    contact: company.settings?.mainTelephone ?? null,
    email: company.settings?.mainEmail ?? null,
  };
}

export async function updateCompanySettings(ctx: RequestContext, raw: unknown) {
  const companyId = auth(ctx, "WRITE");
  const input = settingsInput.parse(raw);
  return prisma.$transaction(async (tx) => {
    const before = await tx.company.findUniqueOrThrow({ where: { id: companyId }, include: { settings: true } });
    if (input.defaultTaxCodeId && !await tx.taxCode.findFirst({ where: { id: input.defaultTaxCodeId, companyId } })) throw new Error("NOT_FOUND");
    if (input.defaultPaymentTermId && !await tx.commercialTerm.findFirst({ where: { id: input.defaultPaymentTermId, companyId, type: "PAYMENT" } })) throw new Error("NOT_FOUND");
    const { legalName, tradingName, smtpPassword, ...settings } = input;
    await tx.company.update({ where: { id: companyId }, data: { legalName, tradingName } });
    // Blank smtpPassword means "leave it as-is" — never overwrite a stored
    // password with an empty string just because the form re-submitted it.
    const willHavePassword = !!(smtpPassword || before.settings?.smtpPassword);
    const willBeConfigured = !!(settings.smtpHost && settings.smtpUsername && settings.smtpFromAddress && willHavePassword);
    const wasConfigured = !!(before.settings?.smtpHost && before.settings?.smtpUsername && before.settings?.smtpFromAddress && before.settings?.smtpPassword);
    const updated = await tx.companySettings.update({
      where: { companyId },
      data: {
        ...settings,
        themeColor: normalizeColor(settings.themeColor),
        accentColor: normalizeColor(settings.accentColor),
        secondaryColor: normalizeColor(settings.secondaryColor),
        mainEmail: settings.mainEmail || null,
        smtpFromAddress: settings.smtpFromAddress || null,
        ...(smtpPassword ? { smtpPassword } : {}),
        ...(willBeConfigured && !wasConfigured ? { smtpConfiguredAt: new Date() } : {}),
      },
    });
    await tx.auditEvent.create({ data: { companyId, actorId: ctx.userId, supportAccessId: ctx.supportAccessId, source: "API", module: "SETTINGS", entityType: "CompanySettings", entityId: updated.id, action: "UPDATE", beforeData: JSON.parse(JSON.stringify({ ...before, settings: before.settings ? { ...before.settings, smtpPassword: undefined } : before.settings })) as Prisma.InputJsonValue, afterData: JSON.parse(JSON.stringify({ legalName, tradingName, ...updated, smtpPassword: undefined })) as Prisma.InputJsonValue, correlationId: ctx.correlationId } });
    return { ...updated, smtpPassword: undefined, smtpConfigured: willBeConfigured };
  });
}

// 2026-09-14 — migrated to object storage (see
// claude/decision-storage-architecture-render-plus-object-storage.md): the
// logo's bytes now live in whichever backend getStorageBackendForCompany
// resolves for this company (Super Admin per-company override, else the
// platform default bucket, else — dev only — local disk), not in
// logoData. logoMimeType/logoFileName/logoSizeBytes are still kept in sync
// on CompanySettings purely so every existing "does this company have a
// logo" check (getCompanySettings, the Platform company-detail page,
// context-types.ts's hasCompanyLogo) keeps working unchanged.
// logoObjectKey now holds the backing Attachment row's id.
async function findLogoAttachment(companyId: string) {
  return prisma.attachment.findFirst({ where: { companyId, ownerType: "COMPANY_LOGO", ownerId: companyId } });
}

export async function updateCompanyLogo(ctx: RequestContext, input: { fileName: string; mimeType: string; contentBase64: string } | null) {
  const companyId = auth(ctx, "WRITE");
  const existing = await findLogoAttachment(companyId);
  if (input === null) {
    if (existing) await deleteAttachment(existing);
    return prisma.companySettings.update({ where: { companyId }, data: { logoData: null, logoMimeType: null, logoFileName: null, logoSizeBytes: null, logoUpdatedAt: new Date(), logoObjectKey: null } });
  }
  if (existing) await deleteAttachment(existing);
  const attachment = await storeAttachment({
    companyId,
    ownerType: "COMPANY_LOGO",
    ownerId: companyId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    contentBase64: input.contentBase64,
    uploadedById: ctx.userId,
    maxSizeBytes: 2_500_000,
    allowedMimePattern: /^image\/(png|jpeg|webp)$/,
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message === "INVALID_ATTACHMENT_TYPE") throw new Error("INVALID_LOGO_TYPE");
    if (error instanceof Error && error.message === "ATTACHMENT_TOO_LARGE") throw new Error("LOGO_TOO_LARGE");
    throw error;
  });
  return prisma.companySettings.update({
    where: { companyId },
    data: { logoData: null, logoMimeType: attachment.mimeType, logoFileName: attachment.fileName, logoSizeBytes: attachment.sizeBytes, logoUpdatedAt: new Date(), logoObjectKey: attachment.id },
  });
}
