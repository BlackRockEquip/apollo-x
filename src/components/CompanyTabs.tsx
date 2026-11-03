"use client";

import { useCallback, useState, type MouseEvent, type ReactNode } from "react";

// 2026-11-03, user request: the platform company page is one very long scroll ("the scrolling is an eyesore"); mockup "Platform company
// view mockup". Each section of the page is a tab. Every tab's content stays mounted (hidden when not shown) so what was typed in a
// form is not lost when switching tabs. A link or button in the page with data-goto-tab="users" opens that tab. The tab is kept in
// the address (?tab=users) so a refresh or a shared link opens the same one.

export type CompanyTab = { key: string; label: string; badge?: number; content: ReactNode };

export function CompanyTabs({ tabs, initial }: { tabs: CompanyTab[]; initial: string }) {
  const [active, setActive] = useState(tabs.some((tab) => tab.key === initial) ? initial : tabs[0]?.key ?? "");

  const show = useCallback((key: string) => {
    setActive(key);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", key);
      // The one-time messages (saved, user added...) belong to the tab the person was sent to, not to the next one they open.
      for (const name of ["notice", "error", "userError", "userAdded", "lifecycleError", "reset", "cloned"]) url.searchParams.delete(name);
      window.history.replaceState(null, "", url.toString());
    } catch { /* the address is only a convenience */ }
  }, []);

  function onContentClick(event: MouseEvent<HTMLDivElement>) {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-goto-tab]");
    const key = target?.dataset.gotoTab;
    if (key && tabs.some((tab) => tab.key === key)) { event.preventDefault(); show(key); window.scrollTo({ top: 0 }); }
  }

  return (
    <div className="pcv-tabs-wrap" onClick={onContentClick}>
      <div className="pcv-tabs" role="tablist" aria-label="Company sections">
        {tabs.map((tab) => (
          <button key={tab.key} type="button" role="tab" id={`pcv-tab-${tab.key}`} aria-selected={active === tab.key} aria-controls={`pcv-panel-${tab.key}`} className={active === tab.key ? "pcv-tab on" : "pcv-tab"} onClick={() => show(tab.key)}>
            {tab.label}{typeof tab.badge === "number" ? <span className="pcv-badge">{tab.badge}</span> : null}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div key={tab.key} role="tabpanel" id={`pcv-panel-${tab.key}`} aria-labelledby={`pcv-tab-${tab.key}`} hidden={active !== tab.key} className="pcv-panel">
          {tab.content}
        </div>
      ))}
    </div>
  );
}
