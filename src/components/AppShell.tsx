"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, Building2, ChevronDown, LayoutDashboard, MapPin, Settings, Tags, Users, Wrench, Factory, PackageOpen, BriefcaseBusiness } from "lucide-react";
import type { ModuleKey } from "@prisma/client";
import type { RequestContext } from "@/lib/auth/context-types";
import { TENANT_ROLE_LABELS } from "@/lib/constants";
import { LogoutButton } from "@/components/LogoutButton";
import { SupportExitButton } from "@/components/SupportExitButton";

type NavItem = {
  key: string;
  label: string;
  href: string;
  module: ModuleKey;
  icon: typeof LayoutDashboard;
};

type NavGroup = {
  key: string;
  label: string;
  icon: typeof LayoutDashboard;
  items: NavItem[];
  footer?: boolean;
};

const DASHBOARD_ITEM: NavItem = { key: "dashboard", label: "Dashboard", href: "/dashboard", module: "DASHBOARD", icon: LayoutDashboard };

const NAV_GROUPS: NavGroup[] = [
  {
    key: "crm",
    label: "CRM",
    icon: Users,
    items: [
      { key: "customers", label: "Customers", href: "/customers", module: "CUSTOMERS", icon: Users },
      { key: "suppliers", label: "Suppliers", href: "/suppliers", module: "SUPPLIERS", icon: Building2 },
    ],
  },
  {
    key: "jobs",
    label: "Jobs",
    icon: BriefcaseBusiness,
    items: [
      { key: "jobs", label: "Jobs & WIP", href: "/jobs", module: "JOBS_WIP", icon: BriefcaseBusiness },
      { key: "job-kits", label: "Job Kits", href: "/job-kits", module: "JOB_KITS", icon: PackageOpen },
    ],
  },
  {
    key: "inventory",
    label: "Inventory",
    icon: Boxes,
    items: [
      { key: "parts", label: "Parts", href: "/parts", module: "INVENTORY", icon: Tags },
      { key: "inventory", label: "Inventory", href: "/inventory", module: "INVENTORY", icon: Boxes },
      { key: "storage-locations", label: "Storage Locations", href: "/storage-locations", module: "STORAGE", icon: MapPin },
      { key: "manufacturers", label: "Manufacturers", href: "/manufacturers", module: "INVENTORY", icon: Factory },
      { key: "service-items", label: "Service Items", href: "/services", module: "QUOTES", icon: Wrench },
    ],
  },
  {
    key: "supply-chain",
    label: "Supply Chain",
    icon: Building2,
    items: [
      { key: "commercial-terms", label: "Commercial Terms", href: "/commercial-terms", module: "QUOTES", icon: Wrench },
    ],
  },
  {
    key: "company-settings",
    label: "Company Settings",
    icon: Settings,
    footer: true,
    items: [
      { key: "tax-terms", label: "Tax & Terms", href: "/tax-codes", module: "CUSTOMERS", icon: Settings },
      { key: "numbering", label: "Numbering", href: "/numbering", module: "CUSTOMERS", icon: PackageOpen },
      { key: "company-settings", label: "Company Settings", href: "/settings", module: "CUSTOMERS", icon: Settings },
    ],
  },
  {
    key: "company-settings",
    label: "Administration",
    icon: Settings,
    footer: true,
    items: [],
  },
];

export function AppShell({ context, companyName, children }: { context: RequestContext; companyName: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const availableDashboard = context.moduleAccess.get(DASHBOARD_ITEM.module) !== "DENIED";
  const groups = useMemo(() => NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => context.moduleAccess.get(item.module) !== "DENIED"),
  })).filter((group) => group.items.length > 0), [context.moduleAccess]);
  const activeGroupKey = useMemo(
    () => groups.find((group) => group.items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)))?.key ?? null,
    [groups, pathname],
  );
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(activeGroupKey);

  function toggleGroup(key: string) {
    setExpandedGroupKey((current) => {
      if (activeGroupKey === key) return key;
      return current === key ? activeGroupKey : key;
    });
  }

  const mainGroups = groups.filter((group) => !group.footer);
  const footerGroups = groups.filter((group) => group.footer);

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="sidebar-brand"><span>AX</span><div><strong>Apollo X</strong><small>{companyName}</small></div></div>
        <nav aria-label="Main navigation">
          {availableDashboard && (
            <Link key={DASHBOARD_ITEM.key} href={DASHBOARD_ITEM.href} className={pathname === DASHBOARD_ITEM.href ? "nav-item active" : "nav-item"}>
              <DASHBOARD_ITEM.icon size={17} />
              <span>{DASHBOARD_ITEM.label}</span>
              {context.moduleAccess.get(DASHBOARD_ITEM.module) === "READ_ONLY" && <em>Read-only</em>}
            </Link>
          )}
          {mainGroups.map((group) => {
            const isActiveGroup = group.items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
            const isExpanded = isActiveGroup || expandedGroupKey === group.key;
            const GroupIcon = group.icon;
            return (
              <section key={group.key} className={isActiveGroup ? "nav-group nav-group-active" : "nav-group"}>
                <button type="button" className="nav-group-toggle" onClick={() => toggleGroup(group.key)} aria-expanded={isExpanded} aria-controls={`group-${group.key}`}>
                  <span className="nav-group-label"><GroupIcon size={16} /> <span>{group.label}</span></span>
                  <ChevronDown size={15} className={isExpanded ? "chevron chevron-open" : "chevron"} />
                </button>
                {isExpanded && (
                  <div id={`group-${group.key}`} className="nav-group-items">
                    {group.items.map((item) => {
                      const readOnly = context.moduleAccess.get(item.module) === "READ_ONLY";
                      const ItemIcon = item.icon;
                      const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                      return (
                        <Link key={item.key} href={item.href} className={active ? "nav-subitem active" : "nav-subitem"}>
                          <ItemIcon size={16} />
                          <span>{item.label}</span>
                          {readOnly && <em>Read-only</em>}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          {footerGroups.map((group) => {
            const isActiveGroup = group.items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
            const isExpanded = isActiveGroup || expandedGroupKey === group.key;
            const GroupIcon = group.icon;
            return (
              <section key={group.key} className={isActiveGroup ? "nav-group nav-group-active" : "nav-group"}>
                <button type="button" className="nav-group-toggle" onClick={() => toggleGroup(group.key)} aria-expanded={isExpanded} aria-controls={`group-${group.key}`}>
                  <span className="nav-group-label"><GroupIcon size={16} /> <span>{group.label}</span></span>
                  <ChevronDown size={15} className={isExpanded ? "chevron chevron-open" : "chevron"} />
                </button>
                {isExpanded && (
                  <div id={`group-${group.key}`} className="nav-group-items">
                    {group.items.map((item) => {
                      const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                      const readOnly = context.moduleAccess.get(item.module) === "READ_ONLY";
                      const ItemIcon = item.icon;
                      return (
                        <Link key={item.key} href={item.href} className={active ? "nav-subitem active" : "nav-subitem"}>
                          <ItemIcon size={16} />
                          <span>{item.label}</span>
                          {readOnly && <em>Read-only</em>}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </aside>
      <div className="workspace">
        {context.supportAccessId && (
          <div className="support-banner">
            <strong>Platform support context</strong>
            <span>{context.supportMode === "READ_ONLY" ? "Read-only access" : "Authorized write access"}</span>
            <SupportExitButton />
          </div>
        )}
        <header className="topbar">
          <div><strong>{companyName}</strong><span>{context.tenantRole ? TENANT_ROLE_LABELS[context.tenantRole] : "Platform support"}</span></div>
          <div className="topbar-user"><span>{context.displayName}</span><LogoutButton /></div>
        </header>
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
