"use client";

import { useState } from "react";
import { MasterDataRoute } from "@/components/MasterDataRoute";

export type ConfigurationTabKind = "tax-codes" | "commercial-terms" | "numbering";
export type ConfigurationTab = { kind: ConfigurationTabKind; label: string };

// 2026-10-01 — user request: "Move Tax codes, Commercial Terms, Numbering
// all under one menu button separate tabs." Was three standalone settings
// pages (tax-codes/page.tsx, commercial-terms/page.tsx, numbering/page.tsx —
// still kept as redirects here, see each), each its own sidebar item; the
// parent configuration/page.tsx only passes the tabs the viewer actually
// holds the permission for (TAX_CODES_VIEW / COMMERCIAL_TERMS_VIEW /
// NUMBERING_VIEW), so this component never needs its own permission check —
// it just renders whichever subset it's handed, defaulting to the first one.
export function ConfigurationWorkspace({ tabs }: { tabs: ConfigurationTab[] }) {
  const [active, setActive] = useState<ConfigurationTabKind>(tabs[0]?.kind ?? "tax-codes");
  const current = tabs.find((t) => t.kind === active) ?? tabs[0];
  if (!current) return null;
  return (
    <div>
      <div className="tab-strip">
        {tabs.map((tab) => (
          <button key={tab.kind} type="button" className={tab.kind === active ? "active" : ""} onClick={() => setActive(tab.kind)}>
            {tab.label}
          </button>
        ))}
      </div>
      <MasterDataRoute key={current.kind} kind={current.kind} hideHeader />
    </div>
  );
}
