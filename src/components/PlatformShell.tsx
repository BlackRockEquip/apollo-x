"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Headset, LayoutDashboard, Package, Settings, ShieldCheck, Users } from "lucide-react";
import type { RequestContext } from "@/lib/auth/context-types";
import { LogoutButton } from "@/components/LogoutButton";

const NAV = [
  { href: "/platform", label: "Overview", icon: LayoutDashboard },
  { href: "/platform/companies", label: "Companies", icon: Building2 },
  { href: "/platform/modules", label: "Modules", icon: Package },
  { href: "/platform/users", label: "Platform Users", icon: Users },
  { href: "/platform/support", label: "Support", icon: Headset },
  { href: "/platform/companies", label: "Support Access", icon: ShieldCheck },
  { href: "/platform", label: "Platform Settings", icon: Settings },
] as const;

export function PlatformShell({ context, title, subtitle, children }: { context: RequestContext; title: string; subtitle?: string; children: React.ReactNode }) {
  const pathname = usePathname();
  return <div className="platform-shell"><aside className="platform-sidebar"><div className="platform-sidebar-brand"><span className="brand-mark small">AX</span><div><p className="eyebrow">Apollo X Platform</p><strong>Admin</strong></div></div><nav className="platform-nav">{NAV.map((item) => { const Icon = item.icon; const active = item.href === "/platform" ? pathname === "/platform" : pathname === item.href || pathname.startsWith(`${item.href}/`); return <Link key={`${item.href}:${item.label}`} href={item.href} className={active ? "platform-nav-item active" : "platform-nav-item"}><Icon size={16} /><span>{item.label}</span></Link>; })}</nav><div className="platform-side-note"><ShieldCheck size={15} /><span>Platform authority never bypasses explicit support context.</span></div></aside><div className="platform-workspace"><header className="platform-header compact-shell"><div><p className="eyebrow">Apollo X Platform</p><h1>{title}</h1>{subtitle ? <p className="muted small-line">{subtitle}</p> : null}</div><div className="topbar-user"><span>{context.displayName}</span><LogoutButton /></div></header><main className="platform-page">{children}</main></div></div>;
}
