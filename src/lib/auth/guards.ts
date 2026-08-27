import type { ModuleKey } from "@prisma/client";
import type { RequestContext } from "@/lib/auth/context-types";
import type { PlatformPermission, TenantPermission } from "@/lib/auth/permissions";

export class AuthorizationError extends Error {
  constructor(message = "You are not authorized to perform this action.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function requireTenant(ctx: RequestContext): asserts ctx is RequestContext & { companyId: string } {
  if (!ctx.companyId) throw new AuthorizationError("An active company context is required.");
}

export function requireTenantPermission(ctx: RequestContext, permission: TenantPermission) {
  requireTenant(ctx);
  if (!ctx.tenantPermissions.has(permission)) throw new AuthorizationError();
  if (ctx.supportAccessId && ctx.supportMode === "READ_ONLY" && !permission.endsWith("_VIEW") && !permission.endsWith("_EXPORT")) {
    throw new AuthorizationError("This platform support context is read-only.");
  }
}

export function requirePlatformPermission(ctx: RequestContext, permission: PlatformPermission) {
  if (!ctx.platformPermissions.has(permission)) throw new AuthorizationError();
}

export function requireModule(ctx: RequestContext, module: ModuleKey, intent: "READ" | "WRITE") {
  requireTenant(ctx);
  const access = ctx.moduleAccess.get(module) ?? "DENIED";
  if (access === "DENIED" || (intent === "WRITE" && access !== "FULL")) {
    throw new AuthorizationError(access === "READ_ONLY" ? "This module is in read-only licence grace mode." : "This module is not licensed for this company.");
  }
}

export function tenantWhere<T extends object>(ctx: RequestContext, where?: T): T & { companyId: string } {
  requireTenant(ctx);
  return { ...(where ?? ({} as T)), companyId: ctx.companyId };
}
