import Link from "next/link";
import type { RequestContext } from "@/lib/auth/context-types";
import { SETTINGS_NAV_ITEMS } from "@/lib/settings-nav";

// 2026-09-10 — the settings tab bar shown at the top of every Settings
// destination (Company/Branding, Dashboard, Users, Tax Codes, Commercial
// Terms, Numbering, Import/Export, Support), reading from the same
// SETTINGS_NAV_ITEMS list the sidebar's Settings group builds itself from
// (see settings-nav.ts) — so this always lists every settings sidebar item,
// not a hand-copied subset that drifts out of date. Filtered by the same
// moduleAccess check the sidebar uses, so a user without access to one of
// these (e.g. no INVOICES/QUOTES licence) doesn't see a dead link here
// either. `current` is this page's own item key, used only to visually
// highlight where you already are — every page passes its own key in.
export function SettingsTabNav({ ctx, current }: { ctx: RequestContext; current: string }) {
  const items = SETTINGS_NAV_ITEMS.filter((item) => (ctx.moduleAccess.get(item.module) ?? "DENIED") !== "DENIED");
  return (
    <nav className="settings-nav">
      {items.map((item) => (
        <Link key={item.key} href={item.href} className={item.key === current ? "quiet-button active" : "quiet-button"}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
