"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { JOB_STATUS_LABELS, MAIN_WORKSHOP_STATUS_STEPS, FIELD_SERVICE_STATUS_STEPS } from "@/lib/jobs/ui";

// ---------------------------------------------------------------------------
// Jobs & WIP list — bulk update. New 2026-10-06, user request: "create a bulk
// update (Status, Close/cancel Job, Send to pex)".
//
// The list itself is a server component (page.tsx), so — same approach as
// JobsWipColumnResize.tsx — this renders no table markup of its own. The page
// renders one <input type="checkbox" class="jobs-select" data-job-id> per row
// plus a select-all box in the header; this component listens for changes on
// the table, keeps the selection in React state, and shows a floating action
// bar (fixed to the bottom of the viewport, so it never shifts the
// fit-to-viewport table) once at least one job is ticked.
//
// All four actions post to /api/v1/jobs/bulk, which runs each job through the
// same service function the job page uses (see lib/jobs/bulk.ts) and returns a
// per-job result. Jobs that succeed are un-ticked and the list refreshed; any
// that were skipped or failed stay ticked and are listed with the reason.
// ---------------------------------------------------------------------------

type BulkResult = {
  action: string;
  succeeded: Array<{ jobId: string; jobNumber: string }>;
  skipped: Array<{ jobId: string; jobNumber: string; reason: string }>;
  failed: Array<{ jobId: string; jobNumber: string; reason: string }>;
};

type DialogKind = "status" | "close" | null;

const ACTION_LABEL: Record<string, string> = { status: "Status change", close: "Close", cancel: "Cancel", pex: "Send to PEX" };

const WORKSHOP_STEPS = MAIN_WORKSHOP_STATUS_STEPS;
const FIELD_STEPS = FIELD_SERVICE_STATUS_STEPS.filter((s) => !WORKSHOP_STEPS.includes(s));

export function JobsWipBulkBar({ tableId, canEdit, canPex }: { tableId: string; canEdit: boolean; canPex: boolean }) {
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [status, setStatus] = useState("");
  const [outcome, setOutcome] = useState("");
  const [closingNote, setClosingNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<BulkResult | null>(null);
  const [toast, setToast] = useState("");

  // Push the React selection back onto the checkboxes (they live in server-
  // rendered markup, and the page auto-refreshes every 20s).
  const syncDom = useCallback(() => {
    const table = document.getElementById(tableId);
    if (!table) return;
    const boxes = Array.from(table.querySelectorAll<HTMLInputElement>("input.jobs-select"));
    let checkedCount = 0;
    for (const box of boxes) {
      const on = selectedRef.current.has(box.dataset.jobId || "");
      if (box.checked !== on) box.checked = on;
      if (on) checkedCount += 1;
    }
    const all = table.querySelector<HTMLInputElement>("input.jobs-select-all");
    if (all) {
      all.checked = boxes.length > 0 && checkedCount === boxes.length;
      all.indeterminate = checkedCount > 0 && checkedCount < boxes.length;
    }
  }, [tableId]);

  useEffect(() => {
    const table = document.getElementById(tableId);
    if (!table) return;
    function onChange(e: Event) {
      const target = e.target as HTMLInputElement;
      if (!target || target.type !== "checkbox") return;
      if (target.classList.contains("jobs-select-all")) {
        const boxes = Array.from(table!.querySelectorAll<HTMLInputElement>("input.jobs-select"));
        setSelected((prev) => {
          const next = new Set(prev);
          for (const box of boxes) { if (target.checked) next.add(box.dataset.jobId || ""); else next.delete(box.dataset.jobId || ""); }
          return next;
        });
      } else if (target.classList.contains("jobs-select")) {
        const id = target.dataset.jobId || "";
        setSelected((prev) => {
          const next = new Set(prev);
          if (target.checked) next.add(id); else next.delete(id);
          return next;
        });
      }
    }
    table.addEventListener("change", onChange);
    // Re-apply after the list refreshes or the filters change the rows.
    const observer = new MutationObserver(() => syncDom());
    observer.observe(table, { childList: true, subtree: true });
    return () => { table.removeEventListener("change", onChange); observer.disconnect(); };
  }, [tableId, syncDom]);

  useEffect(() => { syncDom(); }, [selected, syncDom]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  function clearSelection() { setSelected(new Set()); }

  async function run(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/jobs/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, jobIds: Array.from(selectedRef.current) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "The bulk update failed.");
      const res = data as BulkResult;
      setSelected((prev) => {
        const next = new Set(prev);
        for (const ok of res.succeeded) next.delete(ok.jobId);
        for (const skip of res.skipped) next.delete(skip.jobId);
        return next;
      });
      setDialog(null);
      if (res.failed.length > 0 || res.skipped.length > 0) setResult(res);
      else setToast(`${ACTION_LABEL[res.action] ?? "Update"}: ${res.succeeded.length} job${res.succeeded.length === 1 ? "" : "s"} updated.`);
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "The bulk update failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const count = selected.size;
  const noun = `${count} job${count === 1 ? "" : "s"}`;

  async function cancelJobs() {
    if (!(await confirm({ title: "Cancel jobs", message: `Cancel ${noun}? Their status becomes Completed / Cancelled and any reserved stock is released.`, tone: "danger", confirmLabel: "Cancel jobs" }))) return;
    await run({ action: "cancel" });
  }
  async function sendToPex() {
    if (!(await confirm({ title: "Send to PEX", message: `Send the unit from ${noun} to PEX Inventory? They will show as Pex and appear on the PEX Stock page. Any that can't be sent (not received yet, cancelled, already in PEX) are listed afterwards.`, tone: "warning", confirmLabel: "Send to PEX" }))) return;
    await run({ action: "pex" });
  }

  return <>
    {count > 0 && (
      <div className="jobs-bulk-bar" role="region" aria-label="Bulk update">
        <strong>{count} selected</strong>
        {canEdit && <>
          <button type="button" className="quiet-button" disabled={busy} onClick={() => { setError(""); setStatus(""); setDialog("status"); }}>Change status</button>
          <button type="button" className="quiet-button" disabled={busy} onClick={() => { setError(""); setOutcome(""); setClosingNote(""); setDialog("close"); }}>Close job</button>
          <button type="button" className="quiet-button danger" disabled={busy} onClick={() => void cancelJobs()}>Cancel job</button>
        </>}
        {canPex && <button type="button" className="quiet-button" disabled={busy} onClick={() => void sendToPex()}>Send to PEX</button>}
        <button type="button" className="jobs-bulk-clear" onClick={clearSelection} aria-label="Clear selection" title="Clear selection"><X size={15} /></button>
        {error && !dialog && <span className="jobs-bulk-error">{error}</span>}
      </div>
    )}
    {toast && <div className="jobs-bulk-toast" role="status">{toast}</div>}

    {dialog === "status" && (
      <div className="drawer-backdrop" role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setDialog(null); }}>
        <aside className="form-drawer compact-dialog">
          <header><div><p className="eyebrow">Jobs &amp; WIP</p><h2>Change status of {noun}</h2></div><button type="button" onClick={() => setDialog(null)} aria-label="Close dialog"><X size={18} /></button></header>
          <div className="drawer-fields">
            <label className="wide"><span>New status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Select a status…</option>
                <optgroup label="Workshop flow">{WORKSHOP_STEPS.map((s) => <option key={s} value={s}>{JOB_STATUS_LABELS[s]}</option>)}</optgroup>
                <optgroup label="Field service flow">{FIELD_STEPS.map((s) => <option key={s} value={s}>{JOB_STATUS_LABELS[s]}</option>)}</optgroup>
              </select>
            </label>
            <p className="muted small-line wide">Each job only accepts statuses from its own flow. Jobs the status doesn't suit (or that are still drafts) are left unchanged and listed afterwards.</p>
            {error && <div className="inline-error wide">{error}</div>}
          </div>
          <footer className="detail-actions"><button type="button" className="gold-button" disabled={busy || !status} onClick={() => void run({ action: "status", status })}>{busy ? "Updating…" : "Update status"}</button></footer>
        </aside>
      </div>
    )}

    {dialog === "close" && (
      <div className="drawer-backdrop" role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setDialog(null); }}>
        <aside className="form-drawer compact-dialog">
          <header><div><p className="eyebrow">Jobs &amp; WIP</p><h2>Close {noun}</h2></div><button type="button" onClick={() => setDialog(null)} aria-label="Close dialog"><X size={18} /></button></header>
          <div className="drawer-fields">
            <label><span>Outcome</span><input value={outcome} onChange={(e) => setOutcome(e.target.value)} /></label>
            <label className="wide"><span>Closing note</span><textarea rows={3} value={closingNote} onChange={(e) => setClosingNote(e.target.value)} /></label>
            <p className="muted small-line wide">The same outcome and note are recorded on every selected job.</p>
            {error && <div className="inline-error wide">{error}</div>}
          </div>
          <footer className="detail-actions"><button type="button" className="gold-button" disabled={busy || outcome.trim().length < 2 || closingNote.trim().length < 2} onClick={() => void run({ action: "close", outcome, closingNote })}>{busy ? "Closing…" : "Close jobs"}</button></footer>
        </aside>
      </div>
    )}

    {result && (
      <div className="drawer-backdrop" role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) setResult(null); }}>
        <aside className="form-drawer compact-dialog">
          <header><div><p className="eyebrow">{ACTION_LABEL[result.action] ?? "Bulk update"}</p><h2>{result.succeeded.length} updated{result.skipped.length > 0 ? `, ${result.skipped.length} skipped` : ""}{result.failed.length > 0 ? `, ${result.failed.length} failed` : ""}</h2></div><button type="button" onClick={() => setResult(null)} aria-label="Close dialog"><X size={18} /></button></header>
          <div className="jobs-bulk-result">
            {result.failed.length > 0 && <>
              <h3>Couldn't update</h3>
              <ul>{result.failed.map((row) => <li key={row.jobId}><strong className="mono">{row.jobNumber}</strong> <span>{row.reason}</span></li>)}</ul>
            </>}
            {result.skipped.length > 0 && <>
              <h3>Skipped</h3>
              <ul>{result.skipped.map((row) => <li key={row.jobId}><strong className="mono">{row.jobNumber}</strong> <span>{row.reason}</span></li>)}</ul>
            </>}
            {result.failed.length > 0 && <p className="muted small-line">Jobs that failed stay ticked so you can adjust and try again.</p>}
          </div>
          <footer className="detail-actions"><button type="button" className="gold-button" onClick={() => setResult(null)}>OK</button></footer>
        </aside>
      </div>
    )}
    {confirmDialog}
  </>;
}
