"use client";

import { useState } from "react";
import { Printer } from "lucide-react";

// ---------------------------------------------------------------------------
// Jobs & WIP list — "Print" button. New 2026-10-06, user request: "Create a
// Print view of the table however the user filtered or saved the columns".
//
// Prints exactly what is on screen: the table is already filtered by the
// search / type / status the server rendered it with, and already shows the
// viewer's saved columns in their saved order, so this just reads the rendered
// table (header labels + each cell's full text — innerText ignores the on-
// screen ellipsis clipping) into a print-friendly page: landscape A4, company
// logo and name, the filters that are applied, and a header row that repeats
// on every page. If any rows are ticked for the bulk update, only those are
// printed. The checkbox and "Open" columns are marked .jobs-no-print and left
// out.
//
// Window opened synchronously inside the click (before any await) so pop-up
// blockers allow it, same as the job page's print buttons; the print dialog
// is triggered from the new page's own onload so the logo has loaded by then.
// ---------------------------------------------------------------------------

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

export function JobsWipPrintButton({ tableId, filterSummary }: { tableId: string; filterSummary: string }) {
  const [error, setError] = useState("");

  async function print() {
    setError("");
    const table = document.getElementById(tableId);
    if (!table) return;
    const win = window.open("", "_blank");
    if (!win) { setError("Enable pop-ups to print the list."); return; }

    const headCells = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th")).map((th, index) => ({ index, skip: th.classList.contains("jobs-no-print"), label: (th.textContent || "").trim() })).filter((c) => !c.skip);
    const allRows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr")).filter((tr) => !tr.querySelector("td.table-state"));
    const ticked = allRows.filter((tr) => tr.querySelector<HTMLInputElement>("input.jobs-select")?.checked);
    const rows = ticked.length > 0 ? ticked : allRows;

    const bodyHtml = rows.map((tr) => {
      const cells = Array.from(tr.cells);
      return `<tr>${headCells.map((c, i) => `<td${i === 0 ? ' class="first"' : ""}>${escapeHtml((cells[c.index]?.innerText || "").replace(/\s+/g, " ").trim() || "—")}</td>`).join("")}</tr>`;
    }).join("");

    let org: { name?: string } | null = null;
    try {
      const r = await fetch("/api/v1/company-settings/print-details", { cache: "no-store" });
      if (r.ok) org = await r.json();
    } catch { /* print without the company name */ }

    const fontSize = headCells.length <= 8 ? 10 : headCells.length <= 14 ? 8.5 : 7;
    const printed = new Date().toLocaleString("en-ZA");
    const scope = ticked.length > 0 ? `${rows.length} selected job${rows.length === 1 ? "" : "s"}` : `${rows.length} job${rows.length === 1 ? "" : "s"}`;
    win.document.write(`<!doctype html><html><head><meta charset="utf-8" /><title>Jobs &amp; WIP</title><style>
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
      td.first{white-space:nowrap;font-weight:700;font-family:ui-monospace,Consolas,monospace}
      tr{page-break-inside:avoid}
      tbody tr:nth-child(even) td{background:#fafbfc}
      .empty{padding:24px;text-align:center;color:#666}
    </style></head><body>
      <div class="head">
        <div class="left"><img src="${window.location.origin}/api/v1/company-settings/logo" alt="" onerror="this.style.display='none'" />${org?.name ? `<span class="org">${escapeHtml(org.name)}</span>` : ""}</div>
        <div class="right"><h1>Jobs &amp; WIP</h1><p>${escapeHtml(scope)} · Printed ${escapeHtml(printed)}</p><p>${escapeHtml(filterSummary)}</p></div>
      </div>
      ${rows.length === 0 ? '<div class="empty">No jobs match the current filters.</div>' : `<table><thead><tr>${headCells.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("")}</tr></thead><tbody>${bodyHtml}</tbody></table>`}
      <script>window.onload = function () { window.print(); };</script>
    </body></html>`);
    win.document.close();
  }

  return <>
    <button type="button" className="quiet-button" onClick={() => void print()} title="Print the list as filtered, with your selected columns"><Printer size={14} /> Print</button>
    {error && <span className="jobs-bulk-error">{error}</span>}
  </>;
}
