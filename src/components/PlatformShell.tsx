"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, FileText, Headset, Inbox, LayoutDashboard, Settings, ShieldCheck, Users } from "lucide-react";
import type { RequestContext } from "@/lib/auth/context-types";
import { LogoutButton } from "@/components/LogoutButton";
import { ChangePasswordButton } from "@/components/ChangePasswordButton";
import { PlatformNotificationBell } from "@/components/PlatformNotificationBell";

// 2026-09-22, user report: "Support Access menu -- remove from sidebar as
// its looks like another way to access companies, you tell me if its
// redundant." Confirmed redundant, not just similar-looking: this item's
// href was literally "/platform/companies" — the exact same route the
// "Companies" item above already links to, so it never went anywhere
// different. Real, audited entry into a company's own screens happens from
// the Companies list itself (open a company > "Enter support mode"/"Manage
// users", src/components/SupportContextForm.tsx) — that flow is untouched,
// only this dead second link to the same page is removed. "Support"
// (/platform/support, the cross-tenant support-ticket queue) is a distinct,
// real page and stays.
const NAV = [
  { href: "/platform", label: "Overview", icon: LayoutDashboard },
  { href: "/platform/companies", label: "Companies", icon: Building2 },
  { href: "/platform/users", label: "Platform Users", icon: Users },
  { href: "/platform/support", label: "Support", icon: Headset },
  // 2026-10-19: enquiries from the landing page's "Request a demo" form (New / History).
  { href: "/platform/demo-requests", label: "Demo Requests", icon: Inbox },
  // 2026-10-21: Flo X's own quotations to prospective clients (Draft / Sent / Accepted / Declined).
  { href: "/platform/proposals", label: "Proposals", icon: FileText },
  // 2026-09-22 — this used to point at "/platform" (the same href as
  // Overview above) because the real page didn't exist yet. Now it does
  // (platform/settings/page.tsx — platform-wide SMTP, used only for
  // password-reset emails; see PlatformSettings' comment in schema.prisma).
  { href: "/platform/settings", label: "Platform Settings", icon: Settings },
] as const;

export function PlatformShell({ context, title, subtitle, demoNewCount = 0, children }: { context: RequestContext; title: string; subtitle?: string; demoNewCount?: number; children: React.ReactNode }) {
  const pathname = usePathname();
  return <div className="platform-shell"><aside className="platform-sidebar"><div className="platform-sidebar-brand"><span className="brand-mark small">FX</span><div><p className="eyebrow">Flo X Integrations Platform</p><strong>Admin</strong></div></div><nav className="platform-nav">{NAV.map((item) => { const Icon = item.icon; const active = item.href === "/platform" ? pathname === "/platform" : pathname === item.href || pathname.startsWith(`${item.href}/`); return <Link key={`${item.href}:${item.label}`} href={item.href} className={active ? "platform-nav-item active" : "platform-nav-item"}><Icon size={16} /><span>{item.label}</span>{item.href === "/platform/demo-requests" && demoNewCount > 0 ? <span className="state-badge" style={{ marginLeft: "auto", background: "var(--danger, #b3261e)", color: "#fff" }}>{demoNewCount}</span> : null}</Link>; })}</nav><div className="platform-side-note"><ShieldCheck size={15} /><span>Platform authority never bypasses explicit support context.</span></div></aside><div className="platform-workspace"><header className="platform-header compact-shell"><div><p className="eyebrow">Flo X Integrations Platform</p><h1>{title}</h1>{subtitle ? <p className="muted small-line">{subtitle}</p> : null}</div>{/* 2026-10-01, user request: "if Org Admins click support then it
    should go to System Admin, a proper system flow" — platform staff's
    own bell for those escalations. See PlatformNotificationBell.tsx. */}
<div className="topbar-user"><PlatformNotificationBell /><span>{context.displayName}</span><ChangePasswordButton /><LogoutButton /></div></header><main className="platform-page">{children}</main></div></div>;
}
