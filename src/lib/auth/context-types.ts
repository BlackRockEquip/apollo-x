import type { ModuleKey, SupportAccessMode, TenantRole } from "@prisma/client";
import type { PlatformPermission, TenantPermission } from "@/lib/auth/permissions";
import type { ModuleAccessMode } from "@/lib/entitlements/policy";

export type RequestContext = {
  userId: string;
  displayName: string;
  companyId: string | null;
  companyInternalCode: string | null;
  companyName?: string | null;
  tenantRole: TenantRole | null;
  tenantPermissions: ReadonlySet<TenantPermission>;
  platformPermissions: ReadonlySet<PlatformPermission>;
  supportAccessId: string | null;
  supportMode: SupportAccessMode | null;
  themeColor?: string | null;
  accentColor?: string | null;
  secondaryColor?: string | null;
  hasCompanyLogo?: boolean;
  moduleAccess: ReadonlyMap<ModuleKey, ModuleAccessMode>;
  correlationId: string;
};
