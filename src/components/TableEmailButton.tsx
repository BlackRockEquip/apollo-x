"use client";

import { useState } from "react";
import { Mail, Send, X } from "lucide-react";

// ---------------------------------------------------------------------------
// "Email" button for a table (2026-10-20, user request: "add a button on the
// job wip table next to print that called Email, this will save the current
// table view as PDF and email it to the requested email address").
//
// Reads the table exactly the way the Print button does - the header labels
// and the text of each visible row, so the user's column filters, search and
// saved columns are all respected, and ticked rows (Jobs bulk update) are
// sent alone if any are ticked. The server turns that into a PDF with the
// company letterhead and emails it (POST /api/v1/jobs/email-table). The
// subject, message and signature come from Settings > Templates.
// ---------------------------------------------------------------------------

const LAST_TO_KEY = "table-email-last-to";

function headerLabel(th: HTMLElement) {
  const clone = th.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".tcf-btn, .col-resize-handle").forEach((n) => n.remove());
  return (clone.textContent || "").replace(/\s+/g, " ").trim();
}

function readTable(tableId: string) {
  const table = document.getElementById(tableId);
  if (!table) return null;
  const headCells = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead tr:first-child th"))
    .map((th, index) => ({ index, label: headerLabel(th), skip: th.classList.contains("jobs-no-print") || th.classList.contains("no-print") }))
    .filter((c) => !c.skip && c.label !== "");
  const allRows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"))
    .filter((tr) => !tr.querySelector("td.table-state") && tr.style.display !== "none");
  const ticked = allRows.filter((tr) => tr.querySelector<HTMLInputElement>("input.jobs-select")?.checked);
  const rows = ticked.length > 0 ? ticked : allRows;
  const cellText = (td: HTMLTableCellElement | undefined) => (td?.dataset.printText !== undefined ? td.dataset.printText : td?.dataset.filterValues !== undefined ? td.dataset.filterValues.split("|~|").join(", ") : td?.innerText || "").replace(/\s+/g, " ").trim() || "—";
  return {
    headers: headCells.map((c) => c.label),
    rows: rows.map((tr) => { const cells = Array.from(tr.cells); return headCells.map((c) => cellText(cells[c.index])); }),
    selectedOnly: ticked.length > 0,
    tableFilters: (table as HTMLElement).dataset.filterSummary || "",
  };
}

export function TableEmailButton({ tableId, title, noun = "row", filterSummary = "", endpoint }: { tableId: string; title: string; noun?: string; filterSummary?: string; endpoint: string }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [snapshot, setSnapshot] = useState<ReturnType<typeof readTable>>(null);

  function openDialog() {
    setNotice("");
    setError("");
    const data = readTable(tableId);
    if (!data) return;
    setSnapshot(data);
    try { setTo(window.localStorage.getItem(LAST_TO_KEY) || ""); } catch { /* remembering the address is optional */ }
    setOpen(true);
  }

  async function send() {
    if (!snapshot) return;
    setSending(true);
    setError("");
    try {
      const filters = [filterSummary, snapshot.tableFilters, snapshot.selectedOnly ? "Selected rows only" : ""].filter(Boolean).join("  ·  ");
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to, title, filters, note, headers: snapshot.headers, rows: snapshot.rows }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message || "The email could not be sent.");
      try { window.localStorage.setItem(LAST_TO_KEY, to.trim()); } catch { /* optional */ }
      setOpen(false);
      setNote("");
      setNotice(`Emailed to ${(body.sentTo as string[] | undefined)?.join(", ") || to.trim()}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The email could not be sent.");
    } finally {
      setSending(false);
    }
  }

  const count = snapshot?.rows.length ?? 0;
  return <>
    <button type="button" className="quiet-button" onClick={openDialog} title="Email the list as filtered, as a PDF"><Mail size={14} /> Email</button>
    {notice && <span className="inline-success" role="status">{notice}</span>}
    {open && (
      <div className="drawer-backdrop" role="dialog" aria-modal="true" aria-label="Email table" onMouseDown={(e) => { if (e.target === e.currentTarget && !sending) setOpen(false); }}>
        <aside className="form-drawer compact-dialog">
          <header><div><p className="eyebrow">{title}</p><h2>Email as PDF</h2></div><button type="button" disabled={sending} onClick={() => setOpen(false)} aria-label="Close dialog"><X size={18} /></button></header>
          <div className="drawer-fields" onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") { e.preventDefault(); if (!sending && to.trim().length >= 5) void send(); } }}>
            <p className="muted small-line wide">Sends the table as it is on screen ({count} {noun}{count === 1 ? "" : "s"}{snapshot?.selectedOnly ? ", selected rows only" : ""}, {snapshot?.headers.length ?? 0} columns) as a PDF attachment. The subject and message come from Settings &gt; Templates.</p>
            <label className="wide"><span>Send to *</span><input autoFocus type="email" multiple placeholder="name@company.com" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            <label className="wide"><span>Extra note (optional)</span><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          </div>
          {error ? <p className="form-error" role="alert" style={{ margin: "0 18px 8px", color: "var(--danger, #b3261e)" }}>{error}</p> : null}
          <footer className="detail-actions">
            <button type="button" className="quiet-button" disabled={sending} onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="gold-button" disabled={sending || to.trim().length < 5} onClick={() => void send()}><Send size={14} /> {sending ? "Sending…" : "Send email"}</button>
          </footer>
        </aside>
      </div>
    )}
  </>;
}
