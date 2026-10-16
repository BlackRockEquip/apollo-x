import { redirect } from "next/navigation";
import type { RequestContext } from "@/lib/auth/context-types";
import type { ModuleKey } from "@prisma/client";
import type { ModuleAccessMode } from "@/lib/entitlements/policy";
import type { TenantPermission } from "@/lib/auth/permissions";

// ---------------------------------------------------------------------------
// 2026-10-01 — user request ("User type: User/Mechanic — if a user is not
// authorized to view or enter a section, then it must be hidden
// completely"). Before this file, every (tenant) page.tsx rendered for any
// authenticated tenant user regardless of role — AppShell's sidebar nav
// only ever hid a link (company-level module licensing, via
// context.moduleAccess), never the destination page itself, and nothing
// checked the viewer's own role/tenantPermissions at the page level. So a
// Mechanic who guessed or bookmarked e.g. /customers would land on a real
// (if data-empty/erroring) page — reachable by URL, just not functional.
// That's the opposite of "hidden completely".
//
// requireTenantPageAccess is the page-level counterpart to
// requireTenantPermission (guards.ts), which already protects the *API*
// layer the same way — this just closes the matching gap for the page
// shell itself. Call it as the first line of a tenant page.tsx:
//
//   const context = await getRequestContext();
//   requireTenantPageAccess(context, "CUSTOMERS_VIEW");
//
// It redirects (never throws) so a user who loses a permission doesn't see
// a crash — they're bounced to wherever they *do* have access, same as
// hitting a dead link.
// ---------------------------------------------------------------------------

export function requireTenantPageAccess(context: RequestContext | null, permission: TenantPermission): asserts context is RequestContext {
  if (!context) redirect("/login");
  if (!context.companyId) redirect("/platform");
  if (!context.tenantPermissions.has(permission)) redirect(defaultTenantDestination(context.tenantPermissions, context.moduleAccess));
}

// 2026-10-01 — counterpart to requireTenantPageAccess for a page that
// combines more than one formerly-separate destination behind a single
// route (Configuration = Tax Codes + Commercial Terms + Numbering — see
// configuration/page.tsx and settings-nav.ts's "configuration" item). Lets
// the page through if the viewer holds ANY one of the listed permissions;
// the page itself is responsible for only rendering the tabs the viewer
// actually holds the specific permission for.
export function requireAnyTenantPageAccess(context: RequestContext | null, permissions: TenantPermission[]): asserts context is RequestContext {
  if (!context) redirect("/login");
  if (!context.companyId) redirect("/platform");
  if (!permissions.some((p) => context.tenantPermissions.has(p))) redirect(defaultTenantDestination(context.tenantPermissions, context.moduleAccess));
}

// 2026-10-01 — role-based counterpart to requireTenantPageAccess above, for
// the rare page that needs blocking for one specific role even though that
// role holds the permission the page would otherwise check. Suppliers is
// the first case: a User/Mechanic keeps SUPPLIERS_VIEW (the Outwork
// supplier-name search in JobWorkspace.tsx — /api/v1/master-data/suppliers
// — depends on it), but per "users should not be able to view suppliers
// menu, only access name for outwork purposes" the standalone Suppliers
// section itself (list, Outwork tab, RFQ tab, and a supplier's own detail
// page) should still be unreachable for them. Call it after
// requireTenantPageAccess, as a second check — same redirect-not-throw
// behavior, same reason (no error.tsx boundary in this app).
export function requireNotMechanicPage(context: RequestContext): void {
  if (context.tenantRole === "USER" || context.tenantRole === "WIP_VIEWER") redirect(defaultTenantDestination(context.tenantPermissions, context.moduleAccess));
}

// 2026-10-16 — module-level counterpart: bounce a viewer away from a page
// whose module is switched off for the company (for example Settings >
// Templates when the RFQs module is off), so it is not reachable by URL
// either, not just missing from the menu.
export function requireTenantModulePage(context: RequestContext | null, module: ModuleKey | ModuleKey[], intent: "READ" | "WRITE" = "READ"): asserts context is RequestContext {
  // 2026-10-16, user report: after a platform admin switched Outwork off for a company, refreshing a company page that
  // needs a switched-off module showed a blank screen (the page threw, and this app has no error page). Call this instead
  // of requireModule at the top of a tenant page: if the module is off (or, for WRITE, not fully on) the user is sent to
  // the first page they do have - the Dashboard when it is on. `module` may be a list (any one of them is enough).
  if (!context) redirect("/login");
  if (!context.companyId) redirect("/platform");
  const modules = Array.isArray(module) ? module : [module];
  const ok = modules.some((m) => {
    const access = context.moduleAccess.get(m) ?? "DENIED";
    return access !== "DENIED" && (intent === "READ" || access === "FULL");
  });
  if (!ok) redirect(defaultTenantDestination(context.tenantPermissions, context.moduleAccess));
}

export function defaultTenantDestination(permissions: ReadonlySet<TenantPermission>, moduleAccess?: ReadonlyMap<ModuleKey, ModuleAccessMode>): string {
  // 2026-10-16: when the company's module switches are known, only land on a page whose module is actually on, so a user
  // is never sent to (or bounced between) pages that are switched off. The last resort is Notifications, which needs no
  // module, so there is always somewhere to land.
  const on = (module: ModuleKey) => !moduleAccess || (moduleAccess.get(module) ?? "DENIED") !== "DENIED";
  if (permissions.has("DASHBOARD_VIEW") && on("DASHBOARD")) return "/dashboard";
  if (permissions.has("JOBS_VIEW") && on("JOBS_WIP")) return "/jobs";
  if (permissions.has("JOB_KITS_VIEW") && on("JOB_KITS")) return "/job-kits";
  if (permissions.has("INVENTORY_VIEW") && on("INVENTORY")) return "/inventory";
  if (permissions.has("SUPPLIERS_VIEW") && on("SUPPLIERS")) return "/suppliers";
  if (!moduleAccess) return "/login";
  if (permissions.has("CUSTOMERS_VIEW") && on("CUSTOMERS")) return "/customers";
  if (permissions.has("REPORTS_VIEW") && on("REPORTS")) return "/reports";
  return "/notifications";
}
