import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { RequestContext } from "@/lib/auth/context-types";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
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

export async function updateCompanyLogo(ctx: RequestContext, input: { fileName: string; mimeType: string; contentBase64: string } | null) {
  const companyId = auth(ctx, "WRITE");
  if (input === null) {
    return prisma.companySettings.update({ where: { companyId }, data: { logoData: null, logoMimeType: null, logoFileName: null, logoSizeBytes: null, logoUpdatedAt: new Date(), logoObjectKey: null } });
  }
  if (!/^image\/(png|jpeg|webp)$/.test(input.mimeType)) throw new Error("INVALID_LOGO_TYPE");
  const data = Buffer.from(input.contentBase64, "base64");
  if (data.length > 2_500_000) throw new Error("LOGO_TOO_LARGE");
  return prisma.companySettings.update({ where: { companyId }, data: { logoData: data, logoMimeType: input.mimeType, logoFileName: input.fileName, logoSizeBytes: data.length, logoUpdatedAt: new Date(), logoObjectKey: null } });
}
