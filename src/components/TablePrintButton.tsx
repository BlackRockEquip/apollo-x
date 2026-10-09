"use client";

import { useState } from "react";
import { Printer } from "lucide-react";

// ---------------------------------------------------------------------------
// "Print" button for any table (Jobs & WIP, Parts, RFQs, Outwork, PEX, Job
// Kits). Generalised 2026-10-09 from the Jobs & WIP print button (2026-10-06,
// "Create a Print view of the table however the user filtered or saved the
// columns"), at the user's request: "add print button above all tables like
// Jobs Wip table".
//
// Prints exactly what is on screen: the table's header labels and the text of
// each visible row — so whatever the column filters (TableColumnFilters.tsx)
// or the page's own search hide is left out, and a user's saved Jobs columns
// come out in their saved order. If any rows are ticked for the Jobs bulk
// update, only those are printed. Columns whose header is empty or marked
// jobs-no-print / no-print (checkbox and "Open" columns) are skipped.
//
// The window is opened synchronously inside the click (before any await) so
// pop-up blockers allow it; the print dialog is triggered from the new page's
// own onload so the logo has loaded by then.
// ---------------------------------------------------------------------------

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function headerLabel(th: HTMLElement) {
  const clone = th.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".tcf-btn, .col-resize-handle").forEach((n) => n.remove());
  return (clone.textContent || "").replace(/\s+/g, " ").trim();
}

export function TablePrintButton({ tableId, title, noun = "row", filterSummary = "" }: { tableId: string; title: string; noun?: string; filterSummary?: string }) {
  const [error, setError] = useState("");

  async function print() {
    setError("");
    const table = document.getElementById(tableId);
    if (!table) return;
    const win = window.open("", "_blank");
    if (!win) { setError("Enable pop-ups to print the list."); return; }

    const headCells = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead tr:first-child th"))
      .map((th, index) => ({ index, label: headerLabel(th), skip: th.classList.contains("jobs-no-print") || th.classList.contains("no-print") }))
      .filter((c) => !c.skip && c.label !== "");
    const allRows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"))
      .filter((tr) => !tr.querySelector("td.table-state") && tr.style.display !== "none");
    const ticked = allRows.filter((tr) => tr.querySelector<HTMLInputElement>("input.jobs-select")?.checked);
    const rows = ticked.length > 0 ? ticked : allRows;

    const bodyHtml = rows.map((tr) => {
      const cells = Array.from(tr.cells);
      // A cell that carries data-filter-values (e.g. a status cell holding a dropdown) prints those values rather than its raw text.
      const cellText = (td: HTMLTableCellElement | undefined) => (td?.dataset.filterValues !== undefined ? td.dataset.filterValues.split("|~|").join(", ") : td?.innerText || "").replace(/\s+/g, " ").trim() || "—";
      return `<tr>${headCells.map((c, i) => `<td${i === 0 ? ' class="first"' : ""}>${escapeHtml(cellText(cells[c.index]))}</td>`).join("")}</tr>`;
    }).join("");

    let org: { name?: string } | null = null;
    try {
      const r = await fetch("/api/v1/company-settings/print-details", { cache: "no-store" });
      if (r.ok) org = await r.json();
    } catch { /* print without the company name */ }

    const filters = [filterSummary, (table as HTMLElement).dataset.filterSummary || ""].filter(Boolean).join("  ·  ") || `No filters (all ${noun}s)`;
    const fontSize = headCells.length <= 8 ? 10 : headCells.length <= 14 ? 8.5 : 7;
    const printed = new Date().toLocaleString("en-ZA");
    const plural = (n: number) => `${n} ${noun}${n === 1 ? "" : "s"}`;
    const scope = ticked.length > 0 ? `${plural(rows.length)} selected` : plural(rows.length);
    win.document.write(`<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title><style>
      @page{size:A4 landscape;margin:10mm}
      *{box-sizing:border-box}
      body{font-family:Arial,Helvetica,sans-serif;margin:0;color:#111;font-size:${fontSize}px}
      .head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:10px;padding-bottom:8px;border-bottom:2px solid #111}
      .head .left{display:flex;align-items:center;gap:10px}
      .head img{max-height:38px;max-width:150px;object-fit:contain}
      .head .org{font-size:13px;font-weight:700}
      .head .right{text-align:right}
      .head h1{margin:0;font-size:17px}
      .head p{margin:2px 0 0;color:#444;font-size:10px}
      table{width:100%;border-collapse:collapse}
      thead{display:table-header-group}
      th{background:#eef1f5;text-align:left;font-weight:700;border:1px solid #c9d0da;padding:4px 5px}
      td{border:1px solid #d9dee6;padding:3px 5px;vertical-align:top;word-wrap:break-word;overflow-wrap:anywhere}
      td.first{white-space:nowrap;font-weight:700}
      tr{page-break-inside:avoid}
      tbody tr:nth-child(even) td{background:#fafbfc}
      .empty{padding:24px;text-align:center;color:#666}
    </style></head><body>
      <div class="head">
        <div class="left"><img src="${window.location.origin}/api/v1/company-settings/logo" alt="" onerror="this.style.display='none'" />${org?.name ? `<span class="org">${escapeHtml(org.name)}</span>` : ""}</div>
        <div class="right"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(scope)} · Printed ${escapeHtml(printed)}</p><p>${escapeHtml(filters)}</p></div>
      </div>
      ${rows.length === 0 ? `<div class="empty">Nothing to print — no ${escapeHtml(noun)}s match the current filters.</div>` : `<table><thead><tr>${headCells.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("")}</tr></thead><tbody>${bodyHtml}</tbody></table>`}
      <script>window.onload = function () { window.print(); };</script>
    </body></html>`);
    win.document.close();
  }

  return <>
    <button type="button" className="quiet-button" onClick={() => void print()} title="Print the list as filtered"><Printer size={14} /> Print</button>
    {error && <span className="jobs-bulk-error">{error}</span>}
  </>;
}
