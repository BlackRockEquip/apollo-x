import { z } from "zod";
import type { RequestContext } from "@/lib/auth/context-types";
import { requirePlatformPermission } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";

// 2026-09-22 — platform-wide SMTP config, used only for password-reset
// emails (see lib/email.ts's sendPlatformEmail and auth/password-reset-
// service.ts). Lives here rather than admin-service.ts purely to keep that
// already-large file from growing further; gated by the same
// PLATFORM_CONFIGURATION_MANAGE permission admin-service.ts uses for the
// per-company storage-provider override, since both are "platform
// operator" configuration rather than anything tenant-scoped.
const platformSmtpInput = z.object({
  smtpHost: z.string().trim().max(255).optional().nullable(),
  smtpPort: z.number().int().min(1).max(65535).optional().nullable(),
  smtpSecure: z.boolean().optional(),
  smtpUsername: z.string().trim().max(255).optional().nullable(),
  // Write-only, same "blank means leave unchanged" convention as
  // CompanySettings.smtpPassword.
  smtpPassword: z.string().trim().max(500).optional().nullable(),
  smtpFromAddress: z.string().trim().email().optional().nullable().or(z.literal("")),
  smtpFromName: z.string().trim().max(200).optional().nullable(),
});

function smtpConfigured(settings: { smtpHost: string | null; smtpUsername: string | null; smtpPassword: string | null; smtpFromAddress: string | null } | null) {
  return !!(settings?.smtpHost && settings?.smtpUsername && settings?.smtpPassword && settings?.smtpFromAddress);
}

export async function getPlatformSmtpSettings(ctx: RequestContext) {
  requirePlatformPermission(ctx, "PLATFORM_CONFIGURATION_MANAGE");
  const settings = await prisma.platformSettings.findUnique({ where: { id: "platform" } });
  return {
    smtpHost: settings?.smtpHost ?? "",
    smtpPort: settings?.smtpPort ?? 587,
    smtpSecure: settings?.smtpSecure ?? true,
    smtpUsername: settings?.smtpUsername ?? "",
    smtpFromAddress: settings?.smtpFromAddress ?? "",
    smtpFromName: settings?.smtpFromName ?? "",
    smtpConfigured: smtpConfigured(settings),
  };
}

export async function updatePlatformSmtpSettings(ctx: RequestContext, raw: unknown) {
  requirePlatformPermission(ctx, "PLATFORM_CONFIGURATION_MANAGE");
  const input = platformSmtpInput.parse(raw);
  const before = await prisma.platformSettings.findUnique({ where: { id: "platform" } });
  const { smtpPassword, ...rest } = input;
  const data = { ...rest, smtpFromAddress: rest.smtpFromAddress || null, ...(smtpPassword ? { smtpPassword } : {}) };
  const updated = await prisma.platformSettings.upsert({
    where: { id: "platform" },
    create: { id: "platform", ...data },
    update: data,
  });
  await prisma.auditEvent.create({
    data: {
      actorId: ctx.userId,
      source: "PLATFORM",
      module: "PLATFORM",
      entityType: "PlatformSettings",
      entityId: updated.id,
      action: "PLATFORM_SMTP_UPDATED",
      correlationId: ctx.correlationId,
      beforeData: { smtpHost: before?.smtpHost ?? null, smtpUsername: before?.smtpUsername ?? null, smtpFromAddress: before?.smtpFromAddress ?? null },
      afterData: { smtpHost: updated.smtpHost, smtpUsername: updated.smtpUsername, smtpFromAddress: updated.smtpFromAddress },
    },
  });
  return { ...updated, smtpPassword: undefined, smtpConfigured: smtpConfigured(updated) };
}
