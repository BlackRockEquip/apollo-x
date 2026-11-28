import { z } from "zod";
import type { RequestContext } from "@/lib/auth/context-types";
import { TrainingError } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma";
import { audit, can, requireTraining, settingsFor } from "@/lib/training/access";

// Tech Training settings (2026-11-28): certificate number prefix, default pass mark and attempts, escalation and review periods,
// record retention; and each approver's own signature for the certificates they approve. The certificate logo is the company's
// own logo (Settings > Company), so it is not set here.

export async function getSettings(ctx: RequestContext) {
  const companyId = requireTraining(ctx, "TRAINING_APPROVE");
  const s = await settingsFor(companyId);
  const signer = await prisma.trainingSigner.findUnique({ where: { companyId_userId: { companyId, userId: ctx.userId } } });
  return {
    settings: { certificatePrefix: s.certificatePrefix, defaultPassMark: s.defaultPassMark, defaultMaxAttempts: s.defaultMaxAttempts, escalationDays: s.escalationDays, effectivenessDays: s.effectivenessDays, retentionYears: s.retentionYears },
    fallbackPrefix: ctx.companyInternalCode ?? "FX",
    signer: { name: ctx.displayName, title: signer?.title ?? "", signature: signer?.signatureData && signer.signatureMime ? `data:${signer.signatureMime};base64,${Buffer.from(signer.signatureData).toString("base64")}` : null },
    canEditSettings: can(ctx, "TRAINING_SETTINGS"),
    hasCompanyLogo: !!ctx.hasCompanyLogo,
  };
}

export async function saveSettings(ctx: RequestContext, raw: unknown) {
  const companyId = requireTraining(ctx, "TRAINING_SETTINGS", "WRITE");
  const input = z.object({
    certificatePrefix: z.string().trim().max(12).regex(/^[A-Za-z0-9]*$/, "The prefix can only hold letters and numbers.").optional().default(""),
    defaultPassMark: z.number().int().min(1).max(100),
    defaultMaxAttempts: z.number().int().min(1).max(20),
    escalationDays: z.number().int().min(1).max(60),
    effectivenessDays: z.number().int().min(7).max(365),
    retentionYears: z.number().int().min(10, "Records are kept for at least 10 years.").max(50),
  }).parse(raw);
  await prisma.trainingSettings.upsert({ where: { companyId }, create: { companyId, ...input, certificatePrefix: input.certificatePrefix.toUpperCase() }, update: { ...input, certificatePrefix: input.certificatePrefix.toUpperCase() } });
  await audit(ctx, "TrainingSettings", companyId, "TRAINING_SETTINGS_UPDATED", input);
  return { ok: true };
}

/** An approver's own title and signature image, stamped (as a copy) on each certificate they approve. */
export async function saveSigner(ctx: RequestContext, raw: unknown) {
  const companyId = requireTraining(ctx, "TRAINING_APPROVE", "WRITE");
  const input = z.object({ title: z.string().trim().max(80), signature: z.string().nullable().optional() }).parse(raw);
  let data: Buffer | null | undefined;
  let mime: string | null | undefined;
  if (input.signature === null) { data = null; mime = null; }
  else if (input.signature) {
    const m = /^data:(image\/(png|jpeg|webp));base64,(.+)$/i.exec(input.signature);
    if (!m) throw new TrainingError("FILE_TYPE", "The signature must be a PNG, JPEG or WebP image.");
    data = Buffer.from(m[3], "base64");
    mime = m[1].toLowerCase();
    if (data.length > 600_000) throw new TrainingError("FILE_TOO_BIG", "The signature image is larger than 600 KB.");
  }
  await prisma.trainingSigner.upsert({
    where: { companyId_userId: { companyId, userId: ctx.userId } },
    create: { companyId, userId: ctx.userId, title: input.title, signatureData: data ?? null, signatureMime: mime ?? null },
    update: { title: input.title, ...(data !== undefined ? { signatureData: data, signatureMime: mime } : {}) },
  });
  await audit(ctx, "TrainingSigner", ctx.userId, "TRAINING_SIGNATURE_UPDATED", { title: input.title, signature: data === null ? "removed" : data ? "uploaded" : "unchanged" });
  return { ok: true };
}
