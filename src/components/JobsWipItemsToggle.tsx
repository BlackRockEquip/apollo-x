"use client";

import { useEffect, useState } from "react";
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";

// 2026-10-29, user request (Engineering): the Jobs & WIP list opens a multi-item job into its items, like the list mockup. The
// table itself is server-rendered (filters, search, print and email all work on its rows in the browser), so this only flips
// `data-expanded` on a job's row; CSS shows the item sub-row that follows it. A chevron on each multi-item row opens just that job,
// and the "Show all items" button opens or closes every job at once. What is open is remembered for this tab (sessionStorage), so
// going into a job and coming back leaves the list as it was.
const STORAGE_KEY = "apollox.jobsWipExpanded";

function jobRows(table: HTMLElement): HTMLElement[] {
  return Array.from(table.querySelectorAll<HTMLElement>("tbody tr[data-multi-item='1']"));
}

export function JobsWipItemsToggle({ tableId }: { tableId: string }) {
  const [multiCount, setMultiCount] = useState(0);
  const [openCount, setOpenCount] = useState(0);

  useEffect(() => {
    const table = document.getElementById(tableId);
    if (!table) return;

    function sync() {
      const rows = jobRows(table!);
      setMultiCount(rows.length);
      setOpenCount(rows.filter((row) => row.dataset.expanded === "1").length);
    }
    function save() {
      try {
        const ids = jobRows(table!).filter((row) => row.dataset.expanded === "1").map((row) => row.dataset.jobId ?? "");
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
      } catch { /* storage blocked: the state just is not remembered */ }
    }
    function setOpen(row: HTMLElement, open: boolean) {
      if (open) row.dataset.expanded = "1"; else delete row.dataset.expanded;
      row.querySelector(".jobs-chev")?.setAttribute("aria-expanded", open ? "true" : "false");
    }

    // Restore what was open.
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "[]") as string[];
      for (const row of jobRows(table)) setOpen(row, saved.includes(row.dataset.jobId ?? ""));
    } catch { /* ignore */ }
    sync();

    function onClick(event: MouseEvent) {
      const chev = (event.target as HTMLElement).closest<HTMLElement>(".jobs-chev");
      if (!chev || !table!.contains(chev)) return;
      event.preventDefault();
      event.stopPropagation();
      const row = chev.closest<HTMLElement>("tr");
      if (!row) return;
      setOpen(row, row.dataset.expanded !== "1");
      save();
      sync();
    }
    function onAll(event: Event) {
      const open = (event as CustomEvent<{ open: boolean }>).detail.open;
      for (const row of jobRows(table!)) setOpen(row, open);
      save();
      sync();
    }
    table.addEventListener("click", onClick, true);
    window.addEventListener("jobs-wip:expand-all", onAll);
    // The list refreshes itself every few seconds; rows that arrive are counted too.
    const observer = new MutationObserver(() => sync());
    observer.observe(table, { childList: true, subtree: true });
    return () => {
      table.removeEventListener("click", onClick, true);
      window.removeEventListener("jobs-wip:expand-all", onAll);
      observer.disconnect();
    };
  }, [tableId]);

  if (multiCount === 0) return null;
  const allOpen = openCount === multiCount;
  return (
    <button type="button" className="quiet-button jobs-items-toggle jobs-no-print" aria-pressed={allOpen} onClick={() => window.dispatchEvent(new CustomEvent("jobs-wip:expand-all", { detail: { open: !allOpen } }))}>
      {allOpen ? <ChevronsDownUp size={14} /> : <ChevronsUpDown size={14} />} {allOpen ? "Hide items" : "Show all items"}
    </button>
  );
}
