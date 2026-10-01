import type { ModuleKey } from "@prisma/client";
import type { TenantPermission } from "@/lib/auth/permissions";

export type SettingsNavItem = { key: string; label: string; href: string; module: ModuleKey; permission: TenantPermission };

// 2026-09-10 — single source of truth for every "Settings" destination,
// shared by the sidebar's Settings group (AppShell.tsx) and the tab bar
// shown across the settings pages themselves (SettingsTabNav.tsx). Before
// this, each settings page hand-copied its own hardcoded
// <nav className="settings-nav"> list — which is how it drifted: only
// Company/Branding and Import/Export actually had the tab bar, and even
// there it was missing Numbering/Support/Dashboard, so it looked like the
// tab bar "only shows on Import/Export" (user report). Add or remove a
// settings destination here and both the sidebar and every page's tab bar
// pick it up automatically — nothing to keep in sync by hand anymore.
// 2026-10-01 — added `permission` (TenantPermission) to every item so the
// sidebar (AppShell.tsx) and SettingsTabNav can filter by what the viewer's
// own role is actually allowed to do, not just by company-level module
// licensing (`module`). Per-item choice mirrors the corresponding page's
// own requireTenantPageAccess call — see each (tenant)/.../page.tsx.
export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { key: "company-settings", label: "Company / Branding", href: "/settings", module: "DASHBOARD", permission: "COMPANY_SETTINGS_VIEW" },
  // 2026-09-29 — user request: "Create a template tab under settings which
  // allows me to edit the message/email sent to suppliers, add/edit a
  // signature field..." (CompanyTemplatesForm.tsx). Same DASHBOARD module
  // gate as Company / Branding, since it's the same
  // COMPANY_SETTINGS_VIEW/EDIT-permissioned settings area, just a separate
  // tab for message content instead of branding.
  { key: "email-templates", label: "Templates", href: "/settings/templates", module: "DASHBOARD", permission: "COMPANY_SETTINGS_VIEW" },
  { key: "settings-dashboard", label: "Dashboard", href: "/settings/dashboard", module: "DASHBOARD", permission: "SETTINGS_MANAGE" },
  { key: "users", label: "Users", href: "/users", module: "DASHBOARD", permission: "USERS_MANAGE" },
  { key: "tax-codes", label: "Tax Codes", href: "/tax-codes", module: "CUSTOMERS", permission: "TAX_CODES_VIEW" },
  { key: "commercial-terms", label: "Commercial Terms", href: "/commercial-terms", module: "QUOTES", permission: "COMMERCIAL_TERMS_VIEW" },
  { key: "numbering", label: "Numbering", href: "/numbering", module: "CUSTOMERS", permission: "NUMBERING_VIEW" },
  { key: "import-export", label: "Import / Export", href: "/settings/import-export", module: "DASHBOARD", permission: "SETTINGS_MANAGE" },
  { key: "support", label: "Support", href: "/support", module: "NOTIFICATIONS", permission: "DASHBOARD_VIEW" },
];
