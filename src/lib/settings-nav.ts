import type { ModuleKey } from "@prisma/client";

export type SettingsNavItem = { key: string; label: string; href: string; module: ModuleKey };

// 2026-09-10 — single source of truth for every "Settings" destination,
// shared by the sidebar's Settings group (AppShell.tsx) and the tab bar
// shown across the settings pages themselves (SettingsTabNav.tsx). Before
// this, each settings page hand-copied its own hardcoded
// <nav className="settings-nav"> list — which is how it drifted: only
// Company/Branding and Import/Export actually had the tab bar, and even
// there it was missing Numbering/Support/Dashboard, so it looked like the
// tab bar "only shows on Import/Export" (user report). Add or remove a
// settings destination here and both the sidebar and every page's tab bar
// pick it up automatically — nothing to keep in sync by hand anymore.
export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { key: "company-settings", label: "Company / Branding", href: "/settings", module: "DASHBOARD" },
  { key: "settings-dashboard", label: "Dashboard", href: "/settings/dashboard", module: "DASHBOARD" },
  { key: "users", label: "Users", href: "/users", module: "DASHBOARD" },
  { key: "tax-codes", label: "Tax Codes", href: "/tax-codes", module: "CUSTOMERS" },
  { key: "commercial-terms", label: "Commercial Terms", href: "/commercial-terms", module: "QUOTES" },
  { key: "numbering", label: "Numbering", href: "/numbering", module: "CUSTOMERS" },
  { key: "import-export", label: "Import / Export", href: "/settings/import-export", module: "DASHBOARD" },
  { key: "support", label: "Support", href: "/support", module: "NOTIFICATIONS" },
];
