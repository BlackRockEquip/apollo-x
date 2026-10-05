import Link from "next/link";

// New — 2026-10-05, the Parts screen's tab bar (RFQs / Parts Outstanding), same
// plain-link pattern as SettingsTabNav so each tab is directly linkable and
// loads server-side.
const TABS: Array<{ key: string; label: string; href: string }> = [
  { key: "rfq", label: "RFQs", href: "/parts" },
  { key: "outstanding", label: "Parts Outstanding", href: "/parts/outstanding" },
];

export function PartsTabNav({ current }: { current: string }) {
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
