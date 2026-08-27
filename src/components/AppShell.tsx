import Link from "next/link";
import { BarChart3, Boxes, BriefcaseBusiness, Building2, FileText, LayoutDashboard, MapPin, PackageCheck, Repeat2, Settings, ShoppingCart, Tags, Users, Wrench } from "lucide-react";
import type { ModuleKey } from "@prisma/client";
import type { RequestContext } from "@/lib/auth/context-types";
import { MODULE_LABELS, TENANT_ROLE_LABELS } from "@/lib/constants";
import { LogoutButton } from "@/components/LogoutButton";
import { SupportExitButton } from "@/components/SupportExitButton";

const NAV: Array<{ module: ModuleKey; href: string; icon: typeof LayoutDashboard }> = [
  { module: "DASHBOARD", href: "/dashboard", icon: LayoutDashboard },
  { module: "CUSTOMERS", href: "/customers", icon: Users },
  { module: "SUPPLIERS", href: "/suppliers", icon: Building2 },
  { module: "JOBS_WIP", href: "/jobs", icon: BriefcaseBusiness },
  { module: "INVENTORY", href: "/inventory", icon: Boxes },
  { module: "INVENTORY", href: "/parts", icon: Tags },
  { module: "INVENTORY", href: "/manufacturers", icon: Building2 },
  { module: "STORAGE", href: "/storage-locations", icon: MapPin },
  { module: "QUOTES", href: "/services", icon: Wrench },
  { module: "PEX_STOCK", href: "/pex-stock", icon: PackageCheck },
  { module: "PEX_TRACKING", href: "/pex-tracking", icon: Repeat2 },
  { module: "QUOTES", href: "/quotes", icon: FileText },
  { module: "SALES_ORDERS", href: "/sales-orders", icon: ShoppingCart },
  { module: "INVOICES", href: "/invoices", icon: FileText },
  { module: "REPORTS", href: "/reports", icon: BarChart3 },
];

export function AppShell({ context, companyName, children }: { context: RequestContext; companyName: string; children: React.ReactNode }) {
  const available = NAV.filter((item) => context.moduleAccess.get(item.module) !== "DENIED");
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="sidebar-brand"><span>AX</span><div><strong>Apollo X</strong><small>{companyName}</small></div></div>
        <nav aria-label="Main navigation">
          {available.map(({ module, href, icon: Icon }) => {
            const readOnly = context.moduleAccess.get(module) === "READ_ONLY";
            return <Link key={module} href={href}><Icon size={17} /><span>{MODULE_LABELS[module]}</span>{readOnly && <em>Read-only</em>}</Link>;
          })}
        </nav>
        <div className="sidebar-footer"><Link href="/tax-codes"><Settings size={16} /> Tax & terms</Link><Link href="/numbering"><FileText size={16} /> Numbering</Link><Link href="/settings"><Settings size={16} /> Company settings</Link></div>
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
