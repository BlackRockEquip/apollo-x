import Link from "next/link";

// New — 2026-10-05, the Parts screen's tab bar (RFQs / Parts Outstanding), same
// plain-link pattern as SettingsTabNav so each tab is directly linkable and
// loads server-side.
// 2026-10-06, user request: swap the tabs — Parts Outstanding first (and the
// default page at /parts), RFQs second (/parts/rfq).
const TABS: Array<{ key: string; label: string; href: string }> = [
  { key: "outstanding", label: "Parts Outstanding", href: "/parts" },
  { key: "rfq", label: "RFQs", href: "/parts/rfq" },
];

// 2026-10-16, industry builds: the RFQs tab only shows when the company has RFQ & supplier quotes.
export function PartsTabNav({ current, showRfq = true }: { current: string; showRfq?: boolean }) {
  return (
    <nav className="settings-nav">
      {TABS.filter((tab) => showRfq || tab.key !== "rfq").map((tab) => (
        <Link key={tab.key} href={tab.href} className={tab.key === current ? "quiet-button active" : "quiet-button"}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
