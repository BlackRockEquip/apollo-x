import { z } from "zod";
import type { RequestContext } from "@/lib/auth/context-types";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit/service";
import { DOCUMENT_KINDS, DOCUMENT_TITLE_FORBIDDEN, DOCUMENT_TITLE_MAX, resolveDocumentTitles, type DocumentTitles } from "@/lib/documents/titles";

// Reading the titles is open to every signed-in user of the company (they are
// needed to print and save documents); changing them is an Org Admin action,
// gated like the rest of Company settings.
function tenantCompany(ctx: RequestContext) {
  if (!ctx.companyId) throw new Error("TENANT_CONTEXT_REQUIRED");
  return ctx.companyId;
}

export async function getDocumentTitles(ctx: RequestContext): Promise<DocumentTitles> {
  const companyId = tenantCompany(ctx);
  const settings = await prisma.companySettings.findUnique({ where: { companyId }, select: { documentTitles: true } });
  return resolveDocumentTitles(settings?.documentTitles);
}

export async function getDocumentTitlesForCompany(companyId: string): Promise<DocumentTitles> {
  const settings = await prisma.companySettings.findUnique({ where: { companyId }, select: { documentTitles: true } });
  return resolveDocumentTitles(settings?.documentTitles);
}

const titlesInput = z.object(
  Object.fromEntries(
    DOCUMENT_KINDS.map((k) => [
      k.key,
      z
        .string()
        .trim()
        .max(DOCUMENT_TITLE_MAX, `Keep titles to ${DOCUMENT_TITLE_MAX} characters.`)
        .refine((v) => !DOCUMENT_TITLE_FORBIDDEN.test(v), "A title cannot contain / \\ : * ? \" < > |")
        .optional(),
    ])
  ) as Record<string, z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>>
);

/** Saves the titles; a blank title goes back to the built-in one. */
export async function updateDocumentTitles(ctx: RequestContext, raw: unknown): Promise<DocumentTitles> {
  requireModule(ctx, "DASHBOARD", "WRITE");
  requireTenantPermission(ctx, "COMPANY_SETTINGS_EDIT");
  const companyId = tenantCompany(ctx);
  const input = titlesInput.parse(raw);
  const stored: Record<string, string> = {};
  for (const kind of DOCUMENT_KINDS) {
    const value = input[kind.key]?.trim();
    if (value && value !== kind.defaultTitle) stored[kind.key] = value;
  }
  const before = await prisma.companySettings.findUnique({ where: { companyId }, select: { id: true, documentTitles: true } });
  const updated = await prisma.companySettings.update({ where: { companyId }, data: { documentTitles: stored } });
  await recordAudit(ctx, { source: "UI", module: "SETTINGS", entityType: "CompanySettings", entityId: updated.id, action: "UPDATE_DOCUMENT_TITLES", beforeData: (before?.documentTitles ?? {}) as never, afterData: stored as never });
  return resolveDocumentTitles(stored);
}
