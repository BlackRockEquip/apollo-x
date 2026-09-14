"use client";

import { useEffect, useRef } from "react";

// ---------------------------------------------------------------------------
// Jobs & WIP list — drag-to-resize column widths (2026-09-14, user request:
// "Make the job wip view table columns custom sizable"). Deliberately
// per-browser (localStorage), NOT synced to the account like the column
// *visibility* picker (JobsWipColumnPicker.tsx / wip-columns-service.ts) is
// — a dragged width is a "how my screen is laid out right now" preference,
// not data worth a schema migration to persist server-side.
//
// Renders no visible output of its own. src/app/(tenant)/jobs/page.tsx
// (server component) renders the actual <table id={tableId}> with a
// <colgroup><col data-col-id="..."></colgroup> and one
// <span className="col-resize-handle" data-col-id="..."> per <th> — this
// component just finds those by id/data-attribute after mount and wires up
// the drag. Vanilla DOM mutation for the drag itself rather than React
// state: a resize drag fires on every mousemove, and only ever needs to set
// one inline style per frame — routing that through React re-renders would
// be pure overhead with no upside, since nothing else on the page needs to
// know the live width while dragging.
// ---------------------------------------------------------------------------

const MIN_COLUMN_WIDTH = 70;

export function JobsWipColumnResize({ tableId, storageKey, columns }: { tableId: string; storageKey: string; columns: string[] }) {
  const draggingRef = useRef<{ colId: string; startX: number; startWidth: number } | null>(null);
  // Effect re-runs (and rebinds) whenever the visible column set changes
  // (picker add/remove -> router.refresh()), since the <colgroup>'s <col>
  // elements themselves change but the <table> node persists.
  const columnsKey = columns.join(",");

  useEffect(() => {
    const table = document.getElementById(tableId);
    if (!table) return;

    const cols = new Map<string, HTMLTableColElement>();
    table.querySelectorAll<HTMLTableColElement>("colgroup col[data-col-id]").forEach((col) => {
      const id = col.dataset.colId;
      if (id) cols.set(id, col);
    });

    let saved: Record<string, number> = {};
    try {
      saved = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
    } catch {
      saved = {};
    }
    for (const [id, col] of cols) {
      const width = saved[id];
      if (typeof width === "number" && Number.isFinite(width) && width >= MIN_COLUMN_WIDTH) col.style.width = `${width}px`;
    }

    function persist() {
      const widths: Record<string, number> = {};
      for (const [id, col] of cols) {
        const width = col.style.width ? parseFloat(col.style.width) : NaN;
        if (!Number.isNaN(width)) widths[id] = width;
      }
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(widths));
      } catch {
        // Private browsing / storage disabled — resizing still works for
        // the rest of this session, it just won't be remembered next time.
      }
    }

    function onMouseMove(e: MouseEvent) {
      const drag = draggingRef.current;
      if (!drag) return;
      const col = cols.get(drag.colId);
      if (!col) return;
      col.style.width = `${Math.max(MIN_COLUMN_WIDTH, drag.startWidth + (e.clientX - drag.startX))}px`;
    }

    function onMouseUp() {
      if (!draggingRef.current) return;
      draggingRef.current = null;
      document.body.classList.remove("col-resizing");
      persist();
    }

    function onMouseDown(e: MouseEvent) {
      const handle = (e.target as HTMLElement).closest<HTMLElement>(".col-resize-handle");
      // Optional chaining, not a bare `table.contains` — `table` was
      // already null-checked above, but TS can't carry that narrowing
      // into a nested function declaration like this one (the closure
      // could in principle run after further reassignment), so it still
      // sees `table` as possibly null here.
      if (!handle || !table?.contains(handle)) return;
      const colId = handle.dataset.colId;
      const col = colId ? cols.get(colId) : undefined;
      if (!colId || !col) return;
      e.preventDefault();
      draggingRef.current = { colId, startX: e.clientX, startWidth: col.getBoundingClientRect().width };
      document.body.classList.add("col-resizing");
    }

    table.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      table.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.classList.remove("col-resizing");
    };
  }, [tableId, storageKey, columnsKey]);

  return null;
}
