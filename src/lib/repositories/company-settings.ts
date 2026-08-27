import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { RequestContext } from "@/lib/auth/context-types";
import { requireModule, requireTenant, requireTenantPermission } from "@/lib/auth/guards";

type SettingsDatabase = Pick<typeof prisma, "companySettings">;

export async function getOwnCompanySettings(context: RequestContext, database: SettingsDatabase = prisma) {
  requireTenant(context);
  requireModule(context, "DASHBOARD", "READ");
  return database.companySettings.findUnique({ where: { companyId: context.companyId } });
}

export async function updateOwnCompanySettings(context: RequestContext, settingsId: string, data: Prisma.CompanySettingsUpdateManyMutationInput, database: SettingsDatabase = prisma) {
  requireTenantPermission(context, "SETTINGS_MANAGE");
  requireModule(context, "DASHBOARD", "WRITE");
  requireTenant(context);
  const companyId = context.companyId;
  const result = await database.companySettings.updateMany({ where: { id: settingsId, companyId }, data });
  if (result.count !== 1) throw new Error("RESOURCE_NOT_FOUND");
}
