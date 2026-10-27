"use client";

import type { KeyboardEvent } from "react";
import type { JobTab, JobTabKey } from "./job-tabs";

export function JobTabBar({ tabs, active, onSelect }: { tabs: JobTab[]; active: JobTabKey; onSelect: (key: JobTabKey) => void }) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const index = tabs.findIndex((tab) => tab.key === active);
    const next = tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
    if (!next) return;
    event.preventDefault();
    onSelect(next.key);
    requestAnimationFrame(() => document.getElementById(`jw-tab-${next.key}`)?.focus());
  };
  return (
    <div className="jw-tabs" role="tablist" aria-label="Job sections" onKeyDown={onKeyDown}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          id={`jw-tab-${tab.key}`}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          tabIndex={active === tab.key ? 0 : -1}
          className={active === tab.key ? "jw-tab active" : "jw-tab"}
          onClick={() => onSelect(tab.key)}
        >
          {tab.label}
          {typeof tab.count === "number" ? <span className="jw-tab-count">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
