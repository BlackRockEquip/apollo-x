"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, Building2, ChevronDown, FileSpreadsheet, Headset, LayoutDashboard, MapPin, Menu, Settings, Users, Factory, PackageOpen, BriefcaseBusiness, Repeat, ShieldCheck, Wrench } from "lucide-react";
import type { ModuleKey } from "@prisma/client";
import type { RequestContext } from "@/lib/auth/context-types";
import { TENANT_ROLE_LABELS } from "@/lib/constants";
import { LogoutButton } from "@/components/LogoutButton";
import { SupportExitButton } from "@/components/SupportExitButton";
import { SETTINGS_NAV_ITEMS } from "@/lib/settings-nav";

type NavItem = { key: string; label: string; href: string; module: ModuleKey; icon: typeof LayoutDashboard };
type NavGroup = { key: string; label: string; icon: typeof LayoutDashboard; items: NavItem[]; footer?: boolean };

const DASHBOARD_ITEM: NavItem = { key: "dashboard", label: "Dashboard", href: "/dashboard", module: "DASHBOARD", icon: LayoutDashboard };

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
  "tax-codes": Settings,
  "commercial-terms": Wrench,
  numbering: PackageOpen,
  "import-export": FileSpreadsheet,
  support: Headset,
};
const NAV_GROUPS: NavGroup[] = [
  { key: "crm", label: "CRM", icon: Users, items: [{ key: "customers", label: "Customers", href: "/customers", module: "CUSTOMERS", icon: Users }, { key: "suppliers", label: "Suppliers", href: "/suppliers", module: "SUPPLIERS", icon: Building2 }] },
  { key: "jobs", label: "Jobs", icon: BriefcaseBusiness, items: [{ key: "jobs", label: "Jobs & WIP", href: "/jobs", module: "JOBS_WIP", icon: BriefcaseBusiness }, { key: "job-kits", label: "Job Kits", href: "/job-kits", module: "JOB_KITS", icon: PackageOpen }, { key: "pex-stock", label: "PEX Stock", href: "/pex-stock", module: "PEX_STOCK", icon: Repeat }, { key: "pex-tracking", label: "PEX Tracking", href: "/pex-tracking", module: "PEX_TRACKING", icon: Repeat }] },
  // 2026-09-10 — Parts Catalog folded into Stock Levels (single merged
  // page at /inventory: catalog fields + stock columns + bin location +
  // create/edit/delete), so its own nav item is gone; /parts now redirects
  // there (see src/app/(tenant)/parts/page.tsx).
  { key: "inventory", label: "Inventory", icon: Boxes, items: [{ key: "inventory", label: "Stock Levels", href: "/inventory", module: "INVENTORY", icon: Boxes }, { key: "storage-locations", label: "Storage Locations", href: "/storage-locations", module: "STORAGE", icon: MapPin }, { key: "manufacturers", label: "Manufacturers", href: "/manufacturers", module: "INVENTORY", icon: Factory }] },
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
  const groups = useMemo(() => NAV_GROUPS.map((group) => ({ ...group, items: group.items.filter((item) => (context.moduleAccess.get(item.module) ?? "DENIED") !== "DENIED") })), [context.moduleAccess]);
  const topGroups = groups.filter((group) => !group.footer && group.items.length > 0);
  const footerGroups = groups.filter((group) => group.footer && group.items.length > 0);
  const shellStyle = useMemo(() => ({ ["--tenant-theme" as string]: context.themeColor || undefined, ["--tenant-accent" as string]: context.accentColor || undefined, ["--tenant-secondary" as string]: context.secondaryColor || undefined }), [context.themeColor, context.accentColor, context.secondaryColor]);
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
        <Link href={DASHBOARD_ITEM.href} className={pathname === DASHBOARD_ITEM.href ? "nav-item active" : "nav-item"}><DASHBOARD_ITEM.icon size={18} /><span>{DASHBOARD_ITEM.label}</span></Link>
        <nav>{topGroups.map((group) => { const isActiveGroup = group.items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)); const isExpanded = isActiveGroup || expandedGroupKey === group.key; const GroupIcon = group.icon; return <section key={group.key} className={isActiveGroup ? "nav-group nav-group-active" : "nav-group"}><button type="button" className="nav-group-toggle" onClick={() => toggleGroup(group.key)} aria-expanded={isExpanded} aria-controls={`group-${group.key}`}><span className="nav-group-label"><GroupIcon size={16} /> <span>{group.label}</span></span><ChevronDown size={15} className={isExpanded ? "chevron chevron-open" : "chevron"} /></button>{isExpanded && <div id={`group-${group.key}`} className="nav-group-items">{group.items.map((item) => { const readOnly = context.moduleAccess.get(item.module) === "READ_ONLY"; const ItemIcon = item.icon; const active = pathname === item.href || pathname.startsWith(`${item.href}/`); return <Link key={item.key} href={item.href} className={active ? "nav-subitem active" : "nav-subitem"}><ItemIcon size={16} /><span>{item.label}</span>{readOnly && <em>Read-only</em>}</Link>; })}</div>}</section>; })}</nav>
        <div className="sidebar-footer">{footerGroups.map((group) => { const isActiveGroup = group.items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)); const isExpanded = isActiveGroup || expandedGroupKey === group.key; const GroupIcon = group.icon; return <section key={group.key} className={isActiveGroup ? "nav-group nav-group-active" : "nav-group"}><button type="button" className="nav-group-toggle" onClick={() => toggleGroup(group.key)} aria-expanded={isExpanded} aria-controls={`group-${group.key}`}><span className="nav-group-label"><GroupIcon size={16} /> <span>{group.label}</span></span><ChevronDown size={15} className={isExpanded ? "chevron chevron-open" : "chevron"} /></button>{isExpanded && <div id={`group-${group.key}`} className="nav-group-items">{group.items.map((item) => { const active = pathname === item.href || pathname.startsWith(`${item.href}/`); const readOnly = context.moduleAccess.get(item.module) === "READ_ONLY"; const ItemIcon = item.icon; return <Link key={item.key} href={item.href} className={active ? "nav-subitem active" : "nav-subitem"}><ItemIcon size={16} /><span>{item.label}</span>{readOnly && <em>Read-only</em>}</Link>; })}</div>}</section>; })}</div>
      </aside>
      <div className="workspace">
        {context.supportAccessId && <div className="support-banner"><strong>Platform support context</strong><span>{companyName} · {context.supportMode === "READ_ONLY" ? "Read-only access" : "Read-write access"}</span><Link href="/platform" className="table-action"><ShieldCheck size={14} /> Platform Admin</Link><SupportExitButton /></div>}
        <header className="topbar"><div style={{ display: "flex", alignItems: "center" }}><button type="button" className="mobile-nav-toggle" aria-label={mobileNavOpen ? "Close menu" : "Open menu"} aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((v) => !v)}><Menu size={18} /></button><div style={{ display: "grid" }}><strong>{companyName}</strong><span>{context.tenantRole ? TENANT_ROLE_LABELS[context.tenantRole] : "Platform support"}</span></div></div><div className="topbar-user"><Link href="/support" className="table-action"><Headset size={14} /> Support</Link><span>{context.displayName}</span><LogoutButton /></div></header>
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
