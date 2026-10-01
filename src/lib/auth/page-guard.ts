import { redirect } from "next/navigation";
import type { RequestContext } from "@/lib/auth/context-types";
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
  if (!context.tenantPermissions.has(permission)) redirect(defaultTenantDestination(context.tenantPermissions));
}

// Picks a safe landing page for a given permission set, in rough order of
// "most users have this" — used both as the requireTenantPageAccess
// fallback (bounce a now-unauthorized user somewhere real rather than a
// dead end) and as the post-login destination (see auth/login/route.ts and
// app/login/page.tsx), so a role like Mechanic — which lacks
// DASHBOARD_VIEW — lands on Jobs & WIP instead of an empty/blocked
// Dashboard.
export function defaultTenantDestination(permissions: ReadonlySet<TenantPermission>): string {
  if (permissions.has("DASHBOARD_VIEW")) return "/dashboard";
  if (permissions.has("JOBS_VIEW")) return "/jobs";
  if (permissions.has("JOB_KITS_VIEW")) return "/job-kits";
  if (permissions.has("INVENTORY_VIEW")) return "/inventory";
  if (permissions.has("SUPPLIERS_VIEW")) return "/suppliers";
  return "/login";
}
