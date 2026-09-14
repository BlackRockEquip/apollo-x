import Link from "next/link";

// New — 2026-09-14, the Suppliers screen's tab bar (Suppliers / Outwork /
// RFQ), at the user's request ("On Supplier screen, create a tab menu for
// the following: Suppliers, Outwork, RFQs"). Three real routes, same
// pattern as SettingsTabNav — plain links rather than client-side tab
// state, so each tab is directly linkable/bookmarkable and its own data
// loads server-side.
const TABS: Array<{ key: string; label: string; href: string }> = [
  { key: "suppliers", label: "Suppliers", href: "/suppliers" },
  { key: "outwork", label: "Outwork", href: "/suppliers/outwork" },
  { key: "rfq", label: "RFQs", href: "/suppliers/rfq" },
];

export function SuppliersTabNav({ current }: { current: string }) {
  return (
    <nav className="settings-nav">
      {TABS.map((tab) => (
        <Link key={tab.key} href={tab.href} className={tab.key === current ? "quiet-button active" : "quiet-button"}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
