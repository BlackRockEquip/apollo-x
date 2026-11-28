import type { RequestContext } from "@/lib/auth/context-types";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import type { TenantPermission } from "@/lib/auth/permissions";
import { recordAudit } from "@/lib/audit/service";
import { TrainingError } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { TRAINING_MODULE } from "@/lib/training/model";

// ---------------------------------------------------------------------------
// Tech Training access (2026-11-28). The module must be on for the company (and the user), then:
//   TRAINING_VIEW              take courses (every user type)
//   TRAINING_APPROVE           approve / send back certificates, sign off practical tasks, answer mentor questions, effectiveness reviews
//   TRAINING_CONTENT_EDIT      course manager: add, update, publish, archive, restore, delete drafts
//   TRAINING_REPORTS_VIEW      training records, matrix, ISO reports and exports
//   TRAINING_EMPLOYEES_MANAGE  employee profiles (Company Admin only)
//   TRAINING_SETTINGS          module settings (Company Admin only)
// ---------------------------------------------------------------------------

export const idShape = /^[a-z0-9]{20,40}$/i;

export function requireTraining(ctx: RequestContext, permission: TenantPermission, intent: "READ" | "WRITE" = "READ"): string {
  requireModule(ctx, TRAINING_MODULE, intent);
  requireTenantPermission(ctx, permission);
  return ctx.companyId!;
}

export function can(ctx: RequestContext, permission: TenantPermission): boolean {
  return ctx.tenantPermissions.has(permission) && (ctx.moduleAccess.get(TRAINING_MODULE) ?? "DENIED") !== "DENIED";
}

export function canWrite(ctx: RequestContext, permission: TenantPermission): boolean {
  return ctx.tenantPermissions.has(permission) && ctx.moduleAccess.get(TRAINING_MODULE) === "FULL" && !(ctx.supportAccessId && ctx.supportMode === "READ_ONLY");
}

export function notFound(what = "record"): never {
  throw new TrainingError("NOT_FOUND", `That ${what} was not found.`, 404);
}

export function checkId(id: string, what = "record"): string {
  if (!idShape.test(id)) notFound(what);
  return id;
}

export async function audit(ctx: RequestContext, entityType: string, entityId: string, action: string, afterData?: Record<string, unknown>, reason?: string) {
  await recordAudit(ctx, { source: "UI", module: TRAINING_MODULE, entityType, entityId, action, afterData: afterData as Prisma.InputJsonValue | undefined, reason });
}

/** The training employee profile linked to the signed-in user, if any. */
export async function myEmployee(ctx: RequestContext) {
  if (!ctx.companyId) return null;
  return prisma.trainingEmployee.findFirst({ where: { companyId: ctx.companyId, userId: ctx.userId, status: "ACTIVE" } });
}

export async function settingsFor(companyId: string) {
  const row = await prisma.trainingSettings.findUnique({ where: { companyId } });
  return row ?? { id: "", companyId, certificatePrefix: "", defaultPassMark: 80, defaultMaxAttempts: 3, escalationDays: 5, effectivenessDays: 30, retentionYears: 10, updatedAt: new Date() };
}

/** Display names for user ids (approvers, owners, authors). */
export async function userNames(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((v): v is string => !!v))];
  if (!unique.length) return new Map();
  const rows = await prisma.userIdentity.findMany({ where: { id: { in: unique } }, select: { id: true, displayName: true } });
  return new Map(rows.map((r) => [r.id, r.displayName]));
}

export function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}
