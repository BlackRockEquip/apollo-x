import type { ModuleKey } from "@prisma/client";
import type { TenantPermission } from "@/lib/auth/permissions";
import type { ModuleAccessMode } from "@/lib/entitlements/policy";

// 2026-10-01 — `module`/`permission` now also accept an array, for a single
// nav item that stands in for more than one underlying permission/module
// gate (see the "configuration" item below, which combines what used to be
// three separate Tax Codes / Commercial Terms / Numbering items). An array
// means "any one of these is enough to see the item" — the combined page
// itself then shows only the individual tabs the viewer actually holds the
// permission for (see src/app/(tenant)/configuration/page.tsx).
export type SettingsNavItem = { key: string; label: string; href: string; module: ModuleKey | ModuleKey[]; permission: TenantPermission | TenantPermission[] };

export function settingsNavModuleAllowed(moduleAccess: ReadonlyMap<ModuleKey, ModuleAccessMode>, module: ModuleKey | ModuleKey[]): boolean {
  const modules = Array.isArray(module) ? module : [module];
  return modules.some((m) => (moduleAccess.get(m) ?? "DENIED") !== "DENIED");
}

export function settingsNavPermissionAllowed(tenantPermissions: ReadonlySet<TenantPermission>, permission: TenantPermission | TenantPermission[]): boolean {
  const permissions = Array.isArray(permission) ? permission : [permission];
  return permissions.some((p) => tenantPermissions.has(p));
}

// "Read-only" badge for a nav item: true only if every module it covers is
// at best read-only (none denied-but-irrelevant, none full) — mirrors the
// single-module case (`=== "READ_ONLY"`) when `module` isn't an array.
export function settingsNavModuleReadOnly(moduleAccess: ReadonlyMap<ModuleKey, ModuleAccessMode>, module: ModuleKey | ModuleKey[]): boolean {
  const modules = Array.isArray(module) ? module : [module];
  const allowed = modules.map((m) => moduleAccess.get(m) ?? "DENIED").filter((mode) => mode !== "DENIED");
  return allowed.length > 0 && allowed.every((mode) => mode === "READ_ONLY");
}

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
  // 2026-10-01 — user request: "Allow a Org Admin to send out a message to
  // all users... (Notification banner that popsup)." Originally a third tab
  // inside UsersWorkspace.tsx; moved to its own Settings destination per a
  // follow-up request ("Move broadcast section to its own label under
  // Settings") so it isn't buried inside the Users tab strip.
  { key: "broadcast", label: "Broadcast", href: "/settings/broadcast", module: "DASHBOARD", permission: "USERS_MANAGE" },
  // 2026-10-01 — user request: "Move Tax codes, Commercial Terms, Numbering
  // all under one menu button separate tabs." Was three separate nav items
  // (tax-codes, commercial-terms, numbering), each its own sidebar entry and
  // its own top-level route — collapsed into one "Configuration" item with
  // an internal tab strip (see configuration/page.tsx and
  // ConfigurationWorkspace.tsx). `module`/`permission` are arrays here: the
  // combined item is visible if the viewer holds access to ANY of the three
  // underlying areas, and the page itself shows only the tabs the viewer
  // actually has the permission for. The three old routes (/tax-codes,
  // /commercial-terms, /numbering) are kept as redirects to /configuration
  // so existing bookmarks/links don't break.
  { key: "configuration", label: "Configuration", href: "/configuration", module: ["CUSTOMERS", "QUOTES"], permission: ["TAX_CODES_VIEW", "COMMERCIAL_TERMS_VIEW", "NUMBERING_VIEW"] },
  { key: "import-export", label: "Import / Export", href: "/settings/import-export", module: "DASHBOARD", permission: "SETTINGS_MANAGE" },
  { key: "support", label: "Support", href: "/support", module: "NOTIFICATIONS", permission: "DASHBOARD_VIEW" },
];
