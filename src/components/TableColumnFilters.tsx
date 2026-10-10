"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { readListState, writeListState } from "./list-state";

// ---------------------------------------------------------------------------
// Excel-style column filters for the tables under Jobs.
//
// 2026-10-09, user request: "on all tables under jobs add filter to each table
// header (like excel filter, dropdown and select)". Drop <TableColumnFilters
// tableId=... storageKey=... /> next to a table and every column header gets a
// small ▾ button; clicking it opens a searchable checklist of that column's
// values (with row counts), and unticking a value hides the rows that have it.
//
// How it works: it reads the table that is already on screen (header labels,
// each cell's text) and hides/shows the existing <tr>s — so it works the same
// for the server-rendered Jobs & WIP table and for the client-rendered
// RFQ/Outwork/Parts/PEX tables, without each of them having to be rewritten.
// A MutationObserver re-applies the filters whenever the rows change (auto
// refresh, a save that reloads the list).
//
// Behaviour notes:
// - A filter stores the values that are UNTICKED (excluded), as in Excel, so a
//   brand-new value that turns up later is visible until someone unticks it.
// - Like Excel, each column's list only offers values from rows that pass the
//   OTHER columns' filters.
// - A cell can carry data-filter-values (separated by |~|) when its text is
//   not what should be filtered on — e.g. a status cell that also holds a
//   dropdown, or one that shows a Pex pill beside the status.
// - Filters are kept in sessionStorage per table, so opening a record and
//   coming back leaves the list filtered the same way (see list-state.ts).
// - Rows that are ticked for the Jobs bulk update are un-ticked when a filter
//   hides them, so a bulk action can never touch rows you can't see.
// ---------------------------------------------------------------------------

const BLANK = "(Blanks)";
const SEP = "|~|";
const MAX_LISTED = 300;
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

type Excluded = Record<string, string[]>;
type Column = { label: string; index: number; th: HTMLTableCellElement };

function labelOf(th: HTMLElement): string {
  if (th.dataset.tcfLabel) return th.dataset.tcfLabel;
  const clone = th.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".tcf-btn, .col-resize-handle").forEach((n) => n.remove());
  return (clone.textContent || "").replace(/\s+/g, " ").trim();
}

function readColumns(table: HTMLTableElement): Column[] {
  const headRow = table.tHead?.rows[0];
  if (!headRow) return [];
  return Array.from(headRow.cells)
    .map((th, index) => ({ th, index, label: labelOf(th) }))
    .filter((c) => c.label !== "" && !c.th.classList.contains("jobs-no-print") && !c.th.classList.contains("no-print") && !c.th.classList.contains("jobs-select-cell"));
}

function readRows(table: HTMLTableElement): HTMLTableRowElement[] {
  const rows: HTMLTableRowElement[] = [];
  for (const body of Array.from(table.tBodies)) {
    for (const tr of Array.from(body.rows)) {
      if (tr.querySelector("td.table-state")) continue;
      if (tr.cells.length === 1 && tr.cells[0].colSpan > 1) continue;
      rows.push(tr);
    }
  }
  return rows;
}

function cellValues(tr: HTMLTableRowElement, index: number): string[] {
  const td = tr.cells[index];
  if (!td) return [BLANK];
  const explicit = td.dataset.filterValues;
  if (explicit !== undefined) {
    const parts = explicit.split(SEP).map((s) => s.trim()).filter(Boolean);
    return parts.length > 0 ? parts : [BLANK];
  }
  const text = (td.textContent || "").replace(/\s+/g, " ").trim();
  return [text === "" || text === "—" ? BLANK : text];
}

// 2026-10-09, user report: "job wip search bar is very slow". The Jobs & WIP
// search used to ask the server for a fresh, filtered list on every keystroke
// (re-running the query and re-rendering the whole table). The page now loads
// the jobs once and the search runs here, in the browser, over those rows: each
// <tr> carries data-search (the fields the server search used to look at, in
// lower case), and data-job / data-prev (its own and its "previous job"
// number). A row matches when data-search contains the typed text; like the old
// server search, it also pulls in the jobs linked to a match through previous
// job numbers, in both directions (a few hops at most).
function searchRows(rows: HTMLTableRowElement[], needle: string): Set<HTMLTableRowElement> {
  const direct = rows.filter((tr) => (tr.dataset.search ?? "").includes(needle));
  const result = new Set(direct);
  const byNumber = new Map<string, HTMLTableRowElement[]>();
  const byPrev = new Map<string, HTMLTableRowElement[]>();
  for (const tr of rows) {
    const n = tr.dataset.job;
    if (n) byNumber.set(n, [...(byNumber.get(n) ?? []), tr]);
    const pv = tr.dataset.prev;
    if (pv) byPrev.set(pv, [...(byPrev.get(pv) ?? []), tr]);
  }
  let frontier = direct;
  for (let hop = 0; hop < 5 && frontier.length > 0; hop += 1) {
    const next: HTMLTableRowElement[] = [];
    for (const tr of frontier) {
      const pv = tr.dataset.prev;
      if (pv) for (const r of byNumber.get(pv) ?? []) if (!result.has(r)) { result.add(r); next.push(r); }
      const n = tr.dataset.job;
      if (n) for (const r of byPrev.get(n) ?? []) if (!result.has(r)) { result.add(r); next.push(r); }
    }
    frontier = next;
  }
  return result;
}

function passes(tr: HTMLTableRowElement, filters: Array<{ index: number; ex: Set<string> }>): boolean {
  return filters.every((f) => cellValues(tr, f.index).some((v) => !f.ex.has(v)));
}

export type TableColumnFiltersProps = {
  tableId: string;
  // Key for sessionStorage — one per table.
  storageKey: string;
  // Singular noun for the "X of Y jobs shown" summary.
  noun?: string;
  // Jobs & WIP only: text already typed in the page's search box (?q=), and the
  // switch for in-browser searching (see searchRows). LiveSearchInput sends
  // what is typed afterwards in a "tcf:search" window event.
  initialSearch?: string;
  // Applied the first time the table is opened in a browser session (nothing
  // stored yet): values to leave unticked, e.g. { Status: ["Received"] }.
  defaultExclude?: Record<string, string[]>;
  // Takes priority over stored/default filters: the ONLY values to leave
  // ticked, e.g. { Status: ["Assembly"] } from a dashboard link.
  initialInclude?: Record<string, string[]>;
  // URL query params to drop (history.replaceState) once initialInclude has
  // been taken from them, so the URL doesn't keep a stale filter.
  stripParams?: string[];
};

export function TableColumnFilters({ tableId, storageKey, noun = "row", defaultExclude, initialInclude, stripParams, initialSearch = "" }: TableColumnFiltersProps) {
  const [excluded, setExcluded] = useState<Excluded>({});
  const [ready, setReady] = useState(false);
  const [counts, setCounts] = useState({ shown: 0, total: 0, active: 0, filters: 0 });
  const [pageSearch, setPageSearch] = useState(initialSearch);
  const [popup, setPopup] = useState<{ label: string; left: number; top: number } | null>(null);
  const [search, setSearch] = useState("");
  const [tick, setTick] = useState(0);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const storeKey = `colfilters.${storageKey}`;

  // Initial filters: dashboard link > what this browser tab had > defaults.
  useEffect(() => {
    const table = document.getElementById(tableId) as HTMLTableElement | null;
    if (!table) return;
    let initial: Excluded = {};
    if (initialInclude && Object.keys(initialInclude).length > 0) {
      const cols = readColumns(table);
      const rows = readRows(table);
      for (const [label, include] of Object.entries(initialInclude)) {
        const col = cols.find((c) => c.label === label);
        if (!col) continue;
        const all = new Set<string>();
        for (const tr of rows) for (const v of cellValues(tr, col.index)) all.add(v);
        initial[label] = Array.from(all).filter((v) => !include.includes(v));
      }
    } else {
      const stored = readListState<{ set?: boolean; ex?: Excluded }>(storeKey, {});
      initial = stored.set ? stored.ex ?? {} : defaultExclude ?? {};
    }
    if (stripParams && stripParams.length > 0) {
      try {
        const url = new URL(window.location.href);
        let changed = false;
        for (const p of stripParams) if (url.searchParams.has(p)) { url.searchParams.delete(p); changed = true; }
        if (changed) window.history.replaceState(window.history.state, "", url.pathname + (url.search || "") + url.hash);
      } catch { /* best-effort */ }
    }
    setExcluded(initial);
    setReady(true);
    // Mount-only on purpose.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onSearch(e: Event) {
      const detail = (e as CustomEvent<{ tableId: string; q: string }>).detail;
      if (detail && detail.tableId === tableId) setPageSearch(detail.q || "");
    }
    window.addEventListener("tcf:search", onSearch);
    return () => window.removeEventListener("tcf:search", onSearch);
  }, [tableId]);

  useEffect(() => { if (ready) writeListState(storeKey, { set: true, ex: excluded }); }, [ready, excluded, storeKey]);

  // Header buttons + watching the table for changes.
  useEffect(() => {
    const table = document.getElementById(tableId) as HTMLTableElement | null;
    if (!table) return;
    function inject() {
      for (const col of readColumns(table!)) {
        if (col.th.querySelector(".tcf-btn")) continue;
        col.th.dataset.tcfLabel = col.label;
        col.th.classList.add("tcf-th");
        const b = document.createElement("button");
        b.type = "button";
        b.className = "tcf-btn";
        b.dataset.tcfLabel = col.label;
        b.setAttribute("aria-label", `Filter ${col.label}`);
        b.title = `Filter ${col.label}`;
        b.textContent = "▾";
        col.th.appendChild(b);
      }
    }
    let raf = 0;
    const observer = new MutationObserver(() => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        observer.disconnect();
        inject();
        observer.observe(table, { childList: true, subtree: true, characterData: true });
        setTick((t) => t + 1);
      });
    });
    inject();
    observer.observe(table, { childList: true, subtree: true, characterData: true });
    setTick((t) => t + 1);

    function onClick(e: MouseEvent) {
      const btn = (e.target as HTMLElement).closest<HTMLElement>(".tcf-btn");
      if (!btn || !table!.contains(btn)) return;
      e.preventDefault();
      e.stopPropagation();
      const label = btn.dataset.tcfLabel || "";
      const rect = btn.getBoundingClientRect();
      setSearch("");
      setPopup((cur) => (cur && cur.label === label ? null : { label, left: Math.max(8, Math.min(rect.left, window.innerWidth - 268)), top: rect.bottom + 4 }));
    }
    table.addEventListener("click", onClick, true);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      observer.disconnect();
      table.removeEventListener("click", onClick, true);
      table.querySelectorAll(".tcf-btn").forEach((n) => n.remove());
      table.querySelectorAll(".tcf-th").forEach((n) => { n.classList.remove("tcf-th"); delete (n as HTMLElement).dataset.tcfLabel; });
    };
  }, [tableId]);

  // Hide / show the rows.
  useEffect(() => {
    if (!ready) return;
    const table = document.getElementById(tableId) as HTMLTableElement | null;
    if (!table) return;
    const cols = readColumns(table);
    const rows = readRows(table);
    const needle = pageSearch.trim().toLowerCase();
    const matched = needle ? searchRows(rows, needle) : null;
    const active = Object.entries(excluded)
      .filter(([, v]) => v.length > 0)
      .map(([label, v]) => ({ label, col: cols.find((c) => c.label === label), ex: new Set(v) }))
      .filter((a): a is { label: string; col: Column; ex: Set<string> } => Boolean(a.col))
      .map((a) => ({ label: a.label, index: a.col.index, ex: a.ex }));
    let shown = 0;
    for (const tr of rows) {
      const visible = (!matched || matched.has(tr)) && passes(tr, active);
      const hidden = tr.style.display === "none";
      if (visible) {
        if (hidden) tr.style.display = "";
        shown += 1;
      } else if (!hidden) {
        tr.style.display = "none";
        const box = tr.querySelector<HTMLInputElement>("input.jobs-select:checked");
        if (box) { box.checked = false; box.dispatchEvent(new Event("change", { bubbles: true })); }
      }
    }
    for (const btn of Array.from(table.querySelectorAll<HTMLElement>(".tcf-btn"))) {
      btn.classList.toggle("tcf-active", active.some((a) => a.label === btn.dataset.tcfLabel));
    }
    // Plain-words description for the Print view.
    const parts = active.map((a) => {
      const values = new Set<string>();
      for (const tr of rows) if (!matched || matched.has(tr)) for (const v of cellValues(tr, a.index)) values.add(v);
      const kept = Array.from(values).filter((v) => !a.ex.has(v)).sort((x, y) => collator.compare(x, y));
      return `${a.label}: ${kept.length === 0 ? "none" : kept.length <= 4 ? kept.join(", ") : `${kept.slice(0, 4).join(", ")} +${kept.length - 4} more`}`;
    });
    if (needle) parts.unshift(`Search: "${pageSearch.trim()}"`);
    table.dataset.filterSummary = parts.join("  ·  ");
    const activeAll = active.length + (needle ? 1 : 0);
    setCounts((c) => (c.shown === shown && c.total === rows.length && c.active === activeAll && c.filters === active.length ? c : { shown, total: rows.length, active: activeAll, filters: active.length }));
  }, [excluded, ready, tick, tableId, pageSearch]);

  // Close the popup on outside click / Esc / scroll.
  useEffect(() => {
    if (!popup) return;
    function onDown(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (popupRef.current?.contains(t) || t.closest?.(".tcf-btn")) return;
      setPopup(null);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setPopup(null); }
    function onScroll(e: Event) { if (!popupRef.current?.contains(e.target as Node)) setPopup(null); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    const onResize = () => setPopup(null);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [popup]);

  // This column's values, from rows that pass every OTHER column's filter.
  const options = useMemo(() => {
    if (!popup) return [] as Array<[string, number]>;
    const table = document.getElementById(tableId) as HTMLTableElement | null;
    if (!table) return [];
    const cols = readColumns(table);
    const target = cols.find((c) => c.label === popup.label);
    if (!target) return [];
    const others = Object.entries(excluded)
      .filter(([label, v]) => label !== popup.label && v.length > 0)
      .map(([label, v]) => ({ index: cols.find((c) => c.label === label)?.index ?? -1, ex: new Set(v) }))
      .filter((f) => f.index >= 0);
    const tally = new Map<string, number>();
    const allRows = readRows(table);
    const needle = pageSearch.trim().toLowerCase();
    const matched = needle ? searchRows(allRows, needle) : null;
    for (const tr of allRows) {
      if (matched && !matched.has(tr)) continue;
      if (!passes(tr, others)) continue;
      for (const v of cellValues(tr, target.index)) tally.set(v, (tally.get(v) ?? 0) + 1);
    }
    // Values already unticked stay listed even if no row currently has them.
    for (const v of excluded[popup.label] ?? []) if (!tally.has(v)) tally.set(v, 0);
    return Array.from(tally.entries()).sort((a, b) => (a[0] === BLANK ? 1 : b[0] === BLANK ? -1 : collator.compare(a[0], b[0])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popup, excluded, tick, tableId, pageSearch]);

  const needle = search.trim().toLowerCase();
  const listed = needle ? options.filter(([v]) => v.toLowerCase().includes(needle)) : options;
  const currentEx = new Set(popup ? excluded[popup.label] ?? [] : []);

  function setColumn(label: string, ex: Set<string>) {
    setExcluded((cur) => {
      const next = { ...cur };
      if (ex.size === 0) delete next[label]; else next[label] = Array.from(ex);
      return next;
    });
  }
  function toggle(value: string) {
    if (!popup) return;
    const ex = new Set(currentEx);
    if (ex.has(value)) ex.delete(value); else ex.add(value);
    setColumn(popup.label, ex);
  }
  function selectAll() {
    if (!popup) return;
    if (!needle) { setColumn(popup.label, new Set()); return; }
    // With a search typed: keep only the matches ticked, like Excel's "Add current selection".
    const matching = new Set(listed.map(([v]) => v));
    setColumn(popup.label, new Set(options.map(([v]) => v).filter((v) => !matching.has(v))));
  }
  function clearListed() {
    if (!popup) return;
    const ex = new Set(currentEx);
    for (const [v] of listed) ex.add(v);
    setColumn(popup.label, ex);
  }

  return <>
    {ready && counts.active > 0 && (
      <div className="tcf-summary">
        <span>{counts.shown} of {counts.total} {noun}{counts.total === 1 ? "" : "s"} shown</span>
        {counts.filters > 0 && <button type="button" className="quiet-button" onClick={() => { setExcluded({}); setPopup(null); }}>Clear filters</button>}
      </div>
    )}
    {popup && typeof document !== "undefined" && createPortal(
      <div className="tcf-popup" ref={popupRef} style={{ left: popup.left, top: popup.top }} role="dialog" aria-label={`Filter ${popup.label}`}>
        <div className="tcf-title">{popup.label}</div>
        <input className="tcf-search" autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" aria-label={`Search ${popup.label} values`} />
        <div className="tcf-actions">
          <button type="button" onClick={selectAll}>{needle ? "Select matching only" : "Select all"}</button>
          <button type="button" onClick={clearListed}>{needle ? "Untick matching" : "Clear all"}</button>
        </div>
        <div className="tcf-list">
          {listed.length === 0 && <div className="tcf-empty">No matching values</div>}
          {listed.slice(0, MAX_LISTED).map(([value, count]) => (
            <label key={value}>
              <input type="checkbox" checked={!currentEx.has(value)} onChange={() => toggle(value)} />
              <span className="tcf-value">{value}</span>
              <em>{count}</em>
            </label>
          ))}
          {listed.length > MAX_LISTED && <div className="tcf-empty">Showing the first {MAX_LISTED} of {listed.length} — type in the search box to narrow the list.</div>}
        </div>
        <div className="tcf-foot"><button type="button" onClick={() => setPopup(null)}>Done</button></div>
      </div>,
      document.body,
    )}
  </>;
}
