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
};

export const TENANT_ROLE_LABELS: Record<TenantRole, string> = {
  COMPANY_ADMIN: "Company Administrator",
  MANAGER: "Manager / Foreman",
  USER: "User / Mechanic",
  STORE_CONTROLLER: "Store Controller",
  SALES: "Sales",
  FINANCE: "Finance",
};

export const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  PLATFORM_ADMIN: "Platform Administrator",
  SUPPORT_READ_ONLY: "Read-only Support",
  SUPPORT_OPERATOR: "Support Operator",
  SECURITY_AUDITOR: "Security Auditor",
};
