"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, FileText, Headset, Inbox, LayoutDashboard, Megaphone, Send, Settings, ShieldCheck, SlidersHorizontal, Users } from "lucide-react";
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
const NAV_SECTIONS = [
  {
    label: "Operate",
    items: [
      { href: "/platform", label: "Overview", icon: LayoutDashboard },
      { href: "/platform/companies", label: "Companies", icon: Building2 },
      { href: "/platform/users", label: "Platform Users", icon: Users },
    ],
  },
  {
    label: "Support and sales",
    items: [
      { href: "/platform/support", label: "Support", icon: Headset },
      // 2026-10-19: enquiries from the landing page's "Request a demo" form (New / History).
      { href: "/platform/demo-requests", label: "Demo Requests", icon: Inbox },
      // 2026-10-21: Flo X's own quotations to prospective clients (Draft / Sent / Accepted / Declined).
      { href: "/platform/proposals", label: "Proposals", icon: FileText },
      // 2026-10-22, user request: the proposal price list / wording defaults, moved here from Platform Settings.
      { href: "/platform/proposal-setup", label: "Proposal setup", icon: SlidersHorizontal },
    ],
  },
  {
    label: "Platform",
    items: [
      // 2026-10-27, user request: broadcast a message to all companies, chosen companies or chosen users.
      { href: "/platform/broadcasts", label: "Broadcasts", icon: Send },
      // 2026-10-23, user request: supplier adverts shown in every company's sidebar above Reports, scheduled in timeslots.
      { href: "/platform/advertising", label: "Advertising", icon: Megaphone },
      // Platform-wide SMTP, used only for password-reset emails.
      { href: "/platform/settings", label: "Platform Settings", icon: Settings },
    ],
  },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/platform" ? pathname === "/platform" : pathname === href || pathname.startsWith(`${href}/`);
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "PA";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "")).toUpperCase();
}

export function PlatformShell({ context, title, subtitle, demoNewCount = 0, children }: { context: RequestContext; title: string; subtitle?: string; demoNewCount?: number; children: React.ReactNode }) {
  const pathname = usePathname();
  const current = NAV_SECTIONS.flatMap((section) => section.items.map((item) => ({ section: section.label, label: item.label, href: item.href }))).filter((item) => isActive(pathname, item.href)).sort((x, y) => y.href.length - x.href.length)[0];
  return (
    <div className="platform-shell">
      <aside className="platform-sidebar">
        <div className="platform-sidebar-brand">
          <span className="brand-mark small">FX</span>
          <div><strong>Flo X</strong><span>Platform admin</span></div>
        </div>
        <nav className="platform-nav" aria-label="Platform admin">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} style={{ display: "contents" }}>
              <p className="platform-nav-label">{section.label}</p>
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} className={isActive(pathname, item.href) && current?.href === item.href ? "platform-nav-item active" : "platform-nav-item"}>
                    <Icon size={16} />
                    <span>{item.label}</span>
                    {item.href === "/platform/demo-requests" && demoNewCount > 0 ? <span className="platform-nav-count">{demoNewCount}</span> : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="platform-side-foot">
          <div className="platform-side-note"><ShieldCheck size={15} /><span>Platform authority never bypasses explicit support context.</span></div>
          <div className="platform-side-user">
            <span aria-hidden="true">{initialsOf(context.displayName)}</span>
            <div><strong>{context.displayName}</strong><span>Platform staff</span></div>
          </div>
        </div>
      </aside>
      <div className="platform-workspace">
        <header className="platform-header compact-shell">
          <span className="platform-crumb" title={subtitle}><i aria-hidden="true" />{title}{current ? ` / ${current.label}` : ""}</span>
          {/* 2026-10-01, user request: "if Org Admins click support then it
              should go to System Admin, a proper system flow" - platform staff's
              own bell for those escalations. See PlatformNotificationBell.tsx. */}
          <div className="topbar-user"><PlatformNotificationBell /><ChangePasswordButton /><LogoutButton /></div>
        </header>
        <main className="platform-page">{children}</main>
      </div>
    </div>
  );
}
