"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Boxes, Building2, ChevronDown, FileSpreadsheet, Headset, LayoutDashboard, MapPin, Megaphone, Menu, Settings, Users, Factory, PackageOpen, BriefcaseBusiness, Repeat, ShieldCheck, Wrench, Package, Truck } from "lucide-react";
import type { ModuleKey, TenantRole } from "@prisma/client";
import type { RequestContext } from "@/lib/auth/context-types";
import type { TenantPermission } from "@/lib/auth/permissions";
import { TENANT_ROLE_LABELS } from "@/lib/constants";
import { LogoutButton } from "@/components/LogoutButton";
import { ChangePasswordButton } from "@/components/ChangePasswordButton";
import { SupportExitButton } from "@/components/SupportExitButton";
import { NotificationBell } from "@/components/NotificationBell";
import { SupportRequestDialog } from "@/components/SupportRequestDialog";
import { BroadcastBanner } from "@/components/BroadcastBanner";
import { SETTINGS_NAV_ITEMS, settingsNavModuleAllowed, settingsNavModuleReadOnly, settingsNavPermissionAllowed } from "@/lib/settings-nav";

// 2026-10-01 — `hiddenForMechanic` added for Suppliers: a User/Mechanic
// keeps the SUPPLIERS_VIEW permission (the Outwork supplier-name search in
// JobWorkspace.tsx — /api/v1/master-data/suppliers — depends on it, and the
// user explicitly wants that kept), but per "users should not be able to
// view suppliers menu, only access name for outwork purposes" the
// standalone Suppliers section itself should still be unreachable for that
// role. A permission-only filter can't express "has the permission, but
// still can't see this nav item" — this is the same deliberate role check
// used throughout JobWorkspace.tsx's own mechanic lockdown
// (mechanicFieldsLocked) rather than inventing a second, narrower
// permission nothing else would use.
type NavItem = { key: string; label: string; href: string; module: ModuleKey | ModuleKey[]; permission: TenantPermission | TenantPermission[]; icon: typeof LayoutDashboard; hiddenForMechanic?: boolean };
type NavGroup = { key: string; label: string; icon: typeof LayoutDashboard; items: NavItem[]; footer?: boolean };

const DASHBOARD_ITEM: NavItem = { key: "dashboard", label: "Dashboard", href: "/dashboard", module: "DASHBOARD", permission: "DASHBOARD_VIEW", icon: LayoutDashboard };

// 2026-10-02 — user request: "Create a 'Reports' sidebar button above
// settings." A standalone item (same shape/placement pattern as
// DASHBOARD_ITEM above), rendered in the sidebar footer immediately before
// the Settings group below rather than folded into a NAV_GROUPS group of
// its own — the request was for one button, not a dropdown of several.
// Gated by the module+permission that already existed in the codebase
// before this feature (ModuleKey.REPORTS, TenantPermission REPORTS_VIEW —
// see permissions.ts), same as every other nav item.
const REPORTS_ITEM: NavItem = { key: "reports", label: "Reports", href: "/reports", module: "REPORTS", permission: "REPORTS_VIEW", icon: BarChart3 };

// 2026-10-01 — user report: "When clicking templates button or dashboard
// button, company branding is still highlighted." Every item's active
// state used to be computed independently (`pathname === item.href ||
// pathname.startsWith(item.href + "/")`) — fine on its own, but the
// Settings group's "Company / Branding" item has href "/settings", and
// "Templates"/"Dashboard"/"Import / Export" all live under "/settings/...",
// so visiting any of those also satisfied Company/Branding's own
// startsWith check, highlighting both at once. This picks the single
// longest-href match per group instead (the most specific nav item wins),
// same "longest prefix wins" rule any router would use.
function bestNavMatchHref(items: NavItem[], pathname: string): string | null {
  let best: string | null = null;
  for (const item of items) {
    const matches = pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (matches && (best === null || item.href.length > best.length)) best = item.href;
  }
  return best;
}

// ---------------------------------------------------------------------------
// 2026-10-01 — user request ("User type: User/Mechanic" RBAC pass): a
// shared way for any client component under AppShell (JobWorkspace.tsx, the
// Jobs/WIP list, etc.) to know the viewer's own tenantRole/tenantPermissions
// without every (tenant) page.tsx having to thread RequestContext down as a
// prop by hand. AppShell already receives the full context from the server
// layout (app/(tenant)/layout.tsx) and already wraps every tenant page as
// `children`, so it's the natural place for this. Values pass straight
// through from the server-supplied `context` prop — Next's RSC payload
// already serializes Map/Set natively (context.moduleAccess, a Map, is used
// directly a few lines below), so context.tenantPermissions (a Set) needs
// no extra serialization step here either.
type PermissionsContextValue = { tenantRole: TenantRole | null; tenantPermissions: ReadonlySet<TenantPermission> };
const PermissionsContext = createContext<PermissionsContextValue>({ tenantRole: null, tenantPermissions: new Set() });
export function useTenantPermissions() {
  return useContext(PermissionsContext);
}

// 2026-09-10 — per the user's explicit request, the old standalone "Supply
// Chain" group (just Commercial Terms) and "Administration" group (just
// Users) were removed, and both items folded into the single Settings
// group below — a whole sidebar group for one link each was more chrome
// than the content warranted, and both destinations are settings-shaped
// anyway (Commercial Terms already carries a "Company Settings" eyebrow
// on its own page, per master-data/ui-config.ts).
//
// This group's own item list is built from SETTINGS_NAV_ITEMS
// (settings-nav.ts) rather than a second hardcoded copy — that's the same
// list every settings page's own tab bar (SettingsTabNav.tsx) reads from,
// so the sidebar and every settings page's tab bar can never drift apart
// again the way the tab bar previously did (missing Numbering/Support/
// Dashboard, and only ever shown on 2 of the 8 pages it should cover).
const SETTINGS_ICONS: Record<string, typeof LayoutDashboard> = {
  "company-settings": Settings,
  "settings-dashboard": LayoutDashboard,
  users: Users,
  broadcast: Megaphone,
  configuration: Wrench,
  "import-export": FileSpreadsheet,
  support: Headset,
};
// 2026-10-01 — added `permission` (TenantPermission) to every item so the
// `groups` filter below can hide a destination the viewer's own role isn't
// allowed to use, not just one their company hasn't licensed (`module`,
// checked separately). See permissions.ts's DEFAULT_TENANT_PERMISSIONS for
// what each role actually has.
const NAV_GROUPS: NavGroup[] = [
  // 2026-09-19 — user request: rename the "CRM" sidebar group to
  // "Customers/Suppliers" (clearer than the internal acronym for what's
  // actually just those two pages).
  { key: "crm", label: "Customers/Suppliers", icon: Users, items: [{ key: "customers", label: "Customers", href: "/customers", module: "CUSTOMERS", permission: "CUSTOMERS_VIEW", icon: Users }, { key: "suppliers", label: "Suppliers", href: "/suppliers", module: "SUPPLIERS", permission: "SUPPLIERS_VIEW", icon: Building2, hiddenForMechanic: true }] },
  // 2026-10-05, user request: Outwork and RFQs moved out of the Suppliers tabs
  // into the Jobs group, in this order: Jobs & WIP, Job Kits, Parts (RFQs +
  // Parts Outstanding), Outwork, PEX Stock, PEX Tracking. Parts and Outwork
  // keep the old Suppliers-section rule: hidden for a Mechanic (see
  // hiddenForMechanic and requireNotMechanicPage on those pages).
  { key: "jobs", label: "Jobs", icon: BriefcaseBusiness, items: [{ key: "jobs", label: "Jobs & WIP", href: "/jobs", module: "JOBS_WIP", permission: "JOBS_VIEW", icon: BriefcaseBusiness }, { key: "job-kits", label: "Job Kits", href: "/job-kits", module: "JOB_KITS", permission: "JOB_KITS_VIEW", icon: PackageOpen }, { key: "parts", label: "Parts", href: "/parts", module: "JOBS_WIP", permission: "JOBS_VIEW", icon: Package, hiddenForMechanic: true }, { key: "outwork", label: "Outwork", href: "/outwork", module: "JOBS_WIP", permission: "JOBS_VIEW", icon: Truck, hiddenForMechanic: true }, { key: "pex-stock", label: "PEX Stock", href: "/pex-stock", module: "PEX_STOCK", permission: "PEX_STOCK_VIEW", icon: Repeat }, { key: "pex-tracking", label: "PEX Tracking", href: "/pex-tracking", module: "PEX_TRACKING", permission: "PEX_TRACKING_VIEW", icon: Repeat }] },
  // 2026-09-10 — Parts Catalog folded into Stock Levels (single merged
  // page at /inventory: catalog fields + stock columns + bin location +
  // create/edit/delete), so its own nav item is gone; /parts now redirects
  // there (see src/app/(tenant)/parts/page.tsx).
  { key: "inventory", label: "Inventory", icon: Boxes, items: [{ key: "inventory", label: "Stock Levels", href: "/inventory", module: "INVENTORY", permission: "INVENTORY_VIEW", icon: Boxes }, { key: "storage-locations", label: "Storage Locations", href: "/storage-locations", module: "STORAGE", permission: "STORAGE_LOCATIONS_VIEW", icon: MapPin }, { key: "manufacturers", label: "Manufacturers", href: "/manufacturers", module: "INVENTORY", permission: "MANUFACTURERS_VIEW", icon: Factory }] },
  { key: "settings", label: "Settings", icon: Settings, footer: true, items: SETTINGS_NAV_ITEMS.map((item) => ({ ...item, icon: SETTINGS_ICONS[item.key] ?? Settings })) },
];

export function AppShell({ context, companyName, logoSrc: initialLogoSrc, children }: { context: RequestContext; companyName: string; logoSrc?: string | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);
  // Off-canvas mobile nav — new 2026-09-14, mobile/phone pass ("make sure
  // the UI works well on phones"). Below 640px the sidebar is a
  // position:fixed drawer that stays off-screen until toggled (see
  // .mobile-nav-toggle / .sidebar.mobile-nav-open in globals.css); closing
  // it on every route change means it never stays open across a
  // navigation by accident.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  useEffect(() => { setMobileNavOpen(false); }, [pathname]);
  // 2026-10-01 — now also filtered by context.tenantPermissions (the
  // viewer's own role-derived permission set), not just moduleAccess
  // (company-level licensing) — previously a Mechanic still saw every nav
  // item their company had licensed, regardless of whether their own role
  // was allowed to use it. Also drops any item flagged hiddenForMechanic
  // (see NavItem's own comment — Suppliers today) for a Mechanic
  // specifically, even though their tenantPermissions already includes it.
  const groups = useMemo(() => NAV_GROUPS.map((group) => ({ ...group, items: group.items.filter((item) => settingsNavModuleAllowed(context.moduleAccess, item.module) && settingsNavPermissionAllowed(context.tenantPermissions, item.permission) && !(item.hiddenForMechanic && context.tenantRole === "USER")) })), [context.moduleAccess, context.tenantPermissions, context.tenantRole]);
  const topGroups = groups.filter((group) => !group.footer && group.items.length > 0);
  const footerGroups = groups.filter((group) => group.footer && group.items.length > 0);
  const shellStyle = useMemo(() => ({ ["--tenant-theme" as string]: context.themeColor || undefined, ["--tenant-accent" as string]: context.accentColor || undefined, ["--tenant-secondary" as string]: context.secondaryColor || undefined, ["--tenant-canvas" as string]: context.backgroundColor || undefined }), [context.themeColor, context.accentColor, context.secondaryColor, context.backgroundColor]);
  const logoSrc = initialLogoSrc ?? (context.hasCompanyLogo && context.companyId ? `/api/v1/company-settings/logo?company=${encodeURIComponent(context.companyId)}&v=${encodeURIComponent(`${context.themeColor || ''}:${context.accentColor || ''}`)}` : null);
  function toggleGroup(key: string) { setExpandedGroupKey((current) => current === key ? null : key); }
  return (
    <div className="app-frame tenant-themed-shell" style={shellStyle}>
      {mobileNavOpen && <div className="sidebar-backdrop" onClick={() => setMobileNavOpen(false)} />}
      <aside className={mobileNavOpen ? "sidebar mobile-nav-open" : "sidebar"}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-logo-wrap">
            {logoSrc ? <Image src={logoSrc} alt={`${companyName} logo`} className="brand-logo" width={34} height={34} unoptimized /> : <div className="brand-logo-fallback">AX</div>}
          </div>
          <div><p className="eyebrow">Apollo X</p><strong>{companyName}</strong></div>
        </div>
        {/* 2026-10-01 — was rendered unconditionally for every tenant
            user; now gated by DASHBOARD_VIEW same as every other nav item
            (a Mechanic, for instance, no longer has it — see
            permissions.ts). */}
        {settingsNavPermissionAllowed(context.tenantPermissions, DASHBOARD_ITEM.permission) && <Link href={DASHBOARD_ITEM.href} className={pathname === DASHBOARD_ITEM.href ? "nav-item active" : "nav-item"}><DASHBOARD_ITEM.icon size={18} /><span>{DASHBOARD_ITEM.label}</span></Link>}
        <nav>{topGroups.map((group) => { const bestHref = bestNavMatchHref(group.items, pathname); const isActiveGroup = bestHref !== null; const isExpanded = isActiveGroup || expandedGroupKey === group.key; const GroupIcon = group.icon; return <section key={group.key} className={isActiveGroup ? "nav-group nav-group-active" : "nav-group"}><button type="button" className="nav-group-toggle" onClick={() => toggleGroup(group.key)} aria-expanded={isExpanded} aria-controls={`group-${group.key}`}><span className="nav-group-label"><GroupIcon size={16} /> <span>{group.label}</span></span><ChevronDown size={15} className={isExpanded ? "chevron chevron-open" : "chevron"} /></button>{isExpanded && <div id={`group-${group.key}`} className="nav-group-items">{group.items.map((item) => { const readOnly = settingsNavModuleReadOnly(context.moduleAccess, item.module); const ItemIcon = item.icon; const active = item.href === bestHref; return <Link key={item.key} href={item.href} className={active ? "nav-subitem active" : "nav-subitem"}><ItemIcon size={16} /><span>{item.label}</span>{readOnly && <em>Read-only</em>}</Link>; })}</div>}</section>; })}</nav>
        <div className="sidebar-footer">
          {/* 2026-10-02 — Reports, above Settings (see REPORTS_ITEM's own
              comment above) — same plain nav-item treatment as the
              Dashboard item at the top of the sidebar, not a nav-group. */}
          {settingsNavModuleAllowed(context.moduleAccess, REPORTS_ITEM.module) && settingsNavPermissionAllowed(context.tenantPermissions, REPORTS_ITEM.permission) && <Link href={REPORTS_ITEM.href} className={pathname === REPORTS_ITEM.href || pathname.startsWith(`${REPORTS_ITEM.href}/`) ? "nav-item active" : "nav-item"}><REPORTS_ITEM.icon size={18} /><span>{REPORTS_ITEM.label}</span></Link>}
          {footerGroups.map((group) => { const bestHref = bestNavMatchHref(group.items, pathname); const isActiveGroup = bestHref !== null; const isExpanded = isActiveGroup || expandedGroupKey === group.key; const GroupIcon = group.icon; return <section key={group.key} className={isActiveGroup ? "nav-group nav-group-active" : "nav-group"}><button type="button" className="nav-group-toggle" onClick={() => toggleGroup(group.key)} aria-expanded={isExpanded} aria-controls={`group-${group.key}`}><span className="nav-group-label"><GroupIcon size={16} /> <span>{group.label}</span></span><ChevronDown size={15} className={isExpanded ? "chevron chevron-open" : "chevron"} /></button>{isExpanded && <div id={`group-${group.key}`} className="nav-group-items">{group.items.map((item) => { const active = item.href === bestHref; const readOnly = settingsNavModuleReadOnly(context.moduleAccess, item.module); const ItemIcon = item.icon; return <Link key={item.key} href={item.href} className={active ? "nav-subitem active" : "nav-subitem"}><ItemIcon size={16} /><span>{item.label}</span>{readOnly && <em>Read-only</em>}</Link>; })}</div>}</section>; })}</div>
      </aside>
      <div className="workspace">
        {context.supportAccessId && <div className="support-banner"><strong>Platform support context</strong><span>{companyName} · {context.supportMode === "READ_ONLY" ? "Read-only access" : "Read-write access"}</span><Link href="/platform" className="table-action"><ShieldCheck size={14} /> Platform Admin</Link><SupportExitButton /></div>}
        {/* 2026-10-01, user request: "Allow a Org Admin to send out a
            message to all users/individual users (Notification banner that
            popsup)." Same placement as the support-banner above — always
            visible, at the top of every tenant page — so it reads as a
            popup regardless of which page the recipient happens to be on. */}
        <BroadcastBanner />
        <header className="topbar"><div style={{ display: "flex", alignItems: "center" }}><button type="button" className="mobile-nav-toggle" aria-label={mobileNavOpen ? "Close menu" : "Open menu"} aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((v) => !v)}><Menu size={18} /></button><div style={{ display: "grid" }}><strong>{companyName}</strong><span>{context.tenantRole ? TENANT_ROLE_LABELS[context.tenantRole] : "Platform support"}</span></div></div>{/* 2026-09-19, user request: bell icon next to the Support link, always
    visible from every page — AppShell renders on every tenant page, so
    placing it here (rather than on any one page) is what makes it
    "always visible from every page". See NotificationBell.tsx.
    2026-10-01 — Support is now SupportRequestDialog (a quick popup to log
    a problem) rather than a plain Link straight to /support; see its own
    comment for why. */}
<div className="topbar-user"><NotificationBell /><SupportRequestDialog /><span>{context.displayName}</span><ChangePasswordButton /><LogoutButton /></div></header>
        <main className="page-content"><PermissionsContext.Provider value={{ tenantRole: context.tenantRole, tenantPermissions: context.tenantPermissions }}>{children}</PermissionsContext.Provider></main>
      </div>
    </div>
  );
}
