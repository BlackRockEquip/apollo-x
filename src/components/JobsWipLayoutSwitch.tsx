"use client";

import { useState } from "react";
import { Kanban, Table2 } from "lucide-react";
import { JOBS_LAYOUT_COOKIE, type JobsLayout } from "@/lib/jobs/wip-board";

// 2026-11-06, user request (Jobs & WIP Board view): the Table | Board switch beside the search box. The table is the
// default. Both views are always in the page; this only flips data-layout on the .jobs-panel (jobs-board.css shows
// one and hides the other) and saves the choice in a cookie, which page.tsx reads so the chosen view is there on first
// paint after a reload. The cookie is per browser, like the column widths.
export function JobsWipLayoutSwitch({ initial }: { initial: JobsLayout }) {
  const [layout, setLayout] = useState<JobsLayout>(initial);

  function pick(next: JobsLayout) {
    if (next === layout) return;
    setLayout(next);
    document.querySelector(".jobs-panel")?.setAttribute("data-layout", next);
    try { document.cookie = `${JOBS_LAYOUT_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`; } catch { /* best-effort */ }
    // The board and the table each size themselves to the bottom of the window (FitToViewportBottom); nudge them to re-measure.
    window.dispatchEvent(new Event("resize"));
  }

  return (
    <div className="jb-switch jobs-no-print" role="group" aria-label="View">
      <button type="button" aria-pressed={layout === "table"} onClick={() => pick("table")}><Table2 size={14} aria-hidden="true" /> Table</button>
      <button type="button" aria-pressed={layout === "board"} onClick={() => pick("board")}><Kanban size={14} aria-hidden="true" /> Board</button>
    </div>
  );
}
