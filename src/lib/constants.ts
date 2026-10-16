import { ModuleKey, PlatformRole, TenantRole } from "@prisma/client";

export const BLACK_ROCK_INTERNAL_CODE = "BLACK_ROCK_EQUIPMENT";
export const SESSION_COOKIE = "apollo_x_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12;

export const MODULE_LABELS: Record<ModuleKey, string> = {
  DASHBOARD: "Dashboard",
  CUSTOMERS: "Customers",
  SUPPLIERS: "Suppliers",
  JOBS_WIP: "Jobs & WIP",
  INVENTORY: "Inventory",
  STORAGE: "Storage Locations",
  JOB_KITS: "Job Kits",
  REBUILDS: "Machine Rebuilds",
  PEX_STOCK: "PEX Stock",
  PEX_TRACKING: "PEX Tracking",
  PROCUREMENT: "Procurement & RFQs",
  OUTWORK: "Outwork",
  WARRANTY: "Warranty",
  FIELD_SERVICE: "Field Service",
  NOTIFICATIONS: "Notifications",
  QUOTES: "Quotes",
  SALES_ORDERS: "Sales Orders",
  INVOICES: "Invoices",
  PAYMENTS: "Payments",
  REPORTS: "Reports",
  ATTACHMENTS: "Attachments",
  IMPORT_EXPORT: "Import & Export",
  JOB_PARTS: "Job Parts & Ordering",
  PICK_SLIPS: "Pick Slips",
  SPECIFICATIONS: "Specifications",
};

export const TENANT_ROLE_LABELS: Record<TenantRole, string> = {
  COMPANY_ADMIN: "Company Administrator",
  MANAGER: "Manager / Foreman",
  USER: "User / Mechanic",
  STORE_CONTROLLER: "Store Controller",
  SALES: "Sales",
  FINANCE: "Finance",
  WIP_VIEWER: "WIP View (View Only)",
};

// 2026-10-16, Engineering Business: the user types offered are exactly Company Admin, Manager, Store Controller,
// Machinist and WIP View (View Only). Workshop keeps its own list and wording. A user already holding a type that
// is not in the build's list (an older Sales / Finance user) keeps working; the type just is not offered for new users.
const ENGINEERING_ROLE_LABELS: Partial<Record<TenantRole, string>> = {
  COMPANY_ADMIN: "Company Admin",
  MANAGER: "Manager",
  STORE_CONTROLLER: "Store Controller",
  USER: "Machinist",
  WIP_VIEWER: "WIP View (View Only)",
};
export const ENGINEERING_TENANT_ROLES: TenantRole[] = ["COMPANY_ADMIN", "MANAGER", "STORE_CONTROLLER", "USER", "WIP_VIEWER"];
export const WORKSHOP_TENANT_ROLES: TenantRole[] = ["COMPANY_ADMIN", "MANAGER", "USER", "STORE_CONTROLLER", "SALES", "FINANCE"];

export function tenantRoleLabelsFor(build?: string | null): Record<TenantRole, string> {
  return build === "ENGINEERING" ? { ...TENANT_ROLE_LABELS, ...ENGINEERING_ROLE_LABELS } as Record<TenantRole, string> : TENANT_ROLE_LABELS;
}

export function tenantRolesFor(build?: string | null): TenantRole[] {
  return build === "ENGINEERING" ? ENGINEERING_TENANT_ROLES : WORKSHOP_TENANT_ROLES;
}

export const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  PLATFORM_ADMIN: "Platform Administrator",
  SUPPORT_READ_ONLY: "Read-only Support",
  SUPPORT_OPERATOR: "Support Operator",
  SECURITY_AUDITOR: "Security Auditor",
};
