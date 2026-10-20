"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, FileText, Pencil, Plus, Printer, Trash2, Upload, X } from "lucide-react";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { withPoweredBy } from "@/lib/documents/powered-by";

// 2026-10-16, Specifications module (Engineering Business): the Dimensional Size Report on a job. Mirrors the
// paper form — a header (date, drawing number, machine, measured by, component, operator), a table of the
// dimensions recorded when the job arrived and a table recorded after machining, a Total — with a few
// improvements: parts can be copied from the arrival table to the after-machining table, the totals count
// measured / accepted / rejected, the gauge used is recorded (ISO 9001 traceability), a job can hold several
// reports, and the printout matches the company's form including its document-control block.

type Phase = "ARRIVED" | "AFTER_MACHINING";
type Line = { key: string; phase: Phase; partNumber: string; description: string; outerDiameter: string; innerDiameter: string; length: string; tolerance: string; additionalMeasured: string; accepted: boolean | null };
type OriginalFile = { id: string; fileName: string; mimeType: string; sizeBytes: number };
type Report = { id: string; reportDate: string; drawingNumber: string; machine: string; component: string; measuredBy: string; operator: string; instrument: string; notes: string; lines: Line[]; original: OriginalFile | null };
type FormSettings = { standardText: string | null; documentNumber: string | null; issueDate: string | null; revision: string | null; revisionDate: string | null };
type ServerLine = { phase: Phase; partNumber: string | null; description: string | null; outerDiameter: string | null; innerDiameter: string | null; length: string | null; tolerance: string | null; additionalMeasured: string | null; accepted: boolean | null };
type ServerReport = { id: string; reportDate: string | null; drawingNumber: string | null; machine: string | null; component: string | null; measuredBy: string | null; operator: string | null; instrument: string | null; notes: string | null; lines: ServerLine[]; original?: OriginalFile | null };

let keyCounter = 0;
const nextKey = () => `l${Date.now().toString(36)}${keyCounter++}`;
const todayIso = () => new Date().toISOString().slice(0, 10);

function blankLine(phase: Phase): Line {
  return { key: nextKey(), phase, partNumber: "", description: "", outerDiameter: "", innerDiameter: "", length: "", tolerance: "", additionalMeasured: "", accepted: null };
}

function fromServer(report: ServerReport): Report {
  return {
    id: report.id,
    reportDate: report.reportDate ?? "",
    drawingNumber: report.drawingNumber ?? "",
    machine: report.machine ?? "",
    component: report.component ?? "",
    measuredBy: report.measuredBy ?? "",
    operator: report.operator ?? "",
    instrument: report.instrument ?? "",
    notes: report.notes ?? "",
    lines: report.lines.map((line) => ({ key: nextKey(), phase: line.phase, partNumber: line.partNumber ?? "", description: line.description ?? "", outerDiameter: line.outerDiameter ?? "", innerDiameter: line.innerDiameter ?? "", length: line.length ?? "", tolerance: line.tolerance ?? "", additionalMeasured: line.additionalMeasured ?? "", accepted: line.accepted })),
    original: report.original ?? null,
  };
}

function payloadOf(report: Report) {
  const { id: _id, original: _original, lines, ...header } = report;
  void _id; void _original;
  return {
    ...header,
    reportDate: header.reportDate || null,
    // A completely empty row is not saved.
    lines: lines.filter((line) => lineHasContent(line)).map(({ key: _key, ...rest }) => { void _key; return rest; }),
  };
}

function lineHasContent(line: Line) {
  return Boolean(line.partNumber || line.description || line.outerDiameter || line.innerDiameter || line.length || line.tolerance || line.additionalMeasured || line.accepted !== null);
}

function totals(lines: Line[]) {
  const used = lines.filter(lineHasContent);
  return { measured: used.length, accepted: used.filter((line) => line.accepted === true).length, rejected: used.filter((line) => line.accepted === false).length };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

const ORIGINAL_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_ORIGINAL_BYTES = 8_000_000;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });
}

// Decodes the base64 into a Blob and opens an object URL (Chrome refuses top-level data: URLs).
function openFileInNewTab(mimeType: string, base64: string): boolean {
  const chars = atob(base64);
  const bytes = new Uint8Array(chars.length);
  for (let i = 0; i < chars.length; i++) bytes[i] = chars.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const win = window.open(url, "_blank");
  if (!win) { URL.revokeObjectURL(url); return false; }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

const formatSize = (bytes: number) => (bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`);

type DialogState = { mode: "create" | "edit" | "view"; draft: Report; pendingFile: File | null; removeOriginal: boolean };

export function JobDimensionReports({ jobId, jobLabel, defaultComponent, canEdit, canManageForm }: { jobId: string; jobLabel: string; defaultComponent: string; canEdit: boolean; canManageForm: boolean }) {
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [reports, setReports] = useState<Report[]>([]);
  const [settings, setSettings] = useState<FormSettings>({ standardText: null, documentNumber: null, issueDate: null, revision: null, revisionDate: null });
  const [staff, setStaff] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [formDraft, setFormDraft] = useState<FormSettings>(settings);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [dialogError, setDialogError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const [reportsRes, settingsRes, staffRes] = await Promise.all([
        fetch(`/api/v1/dimension-reports?jobId=${encodeURIComponent(jobId)}`, { cache: "no-store" }),
        fetch("/api/v1/dimension-reports/settings", { cache: "no-store" }),
        fetch("/api/v1/jobs/mechanics", { cache: "no-store" }).catch(() => null),
      ]);
      const reportsBody = await reportsRes.json();
      if (!reportsRes.ok) throw new Error(reportsBody.error?.message || "Unable to load the dimensional reports.");
      setReports((reportsBody.items as ServerReport[]).map(fromServer));
      if (settingsRes.ok) setSettings(await settingsRes.json());
      if (staffRes && staffRes.ok) setStaff(((await staffRes.json()).items || []).map((row: { label: string }) => String(row.label)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load the dimensional reports.");
    } finally {
      setLoading(false);
    }
  }, [jobId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- async resource load, same pattern as the other workspaces
  useEffect(() => { void load(); }, [load]);

  // ---- window (dialog) -------------------------------------------------------------------------------------
  function withBlankRows(report: Report): Report {
    const lines = [...report.lines];
    for (const phase of ["ARRIVED", "AFTER_MACHINING"] as Phase[]) if (!lines.some((line) => line.phase === phase)) lines.push(blankLine(phase));
    return { ...report, lines };
  }

  function openCreate() {
    setDialogError(""); setNote("");
    const blank: Report = { id: "", reportDate: todayIso(), drawingNumber: "", machine: "", component: defaultComponent || "", measuredBy: "", operator: "", instrument: "", notes: "", lines: [], original: null };
    setDialog({ mode: "create", draft: withBlankRows(blank), pendingFile: null, removeOriginal: false });
  }

  function openReport(report: Report, mode: "view" | "edit") {
    setDialogError(""); setNote("");
    setDialog({ mode, draft: mode === "edit" ? withBlankRows(report) : report, pendingFile: null, removeOriginal: false });
  }

  function closeDialog() { if (!saving) setDialog(null); }

  function patchDraft(change: (report: Report) => Report) {
    setDialog((current) => (current ? { ...current, draft: change(current.draft) } : current));
    setDialogError("");
  }

  function chooseOriginal(file: File | null) {
    if (!file) return;
    if (!ORIGINAL_TYPES.includes(file.type)) { setDialogError("Upload the original as a photo (JPG, PNG, WebP) or a PDF."); return; }
    if (file.size > MAX_ORIGINAL_BYTES) { setDialogError("That file is too large (8 MB maximum)."); return; }
    setDialogError("");
    setDialog((current) => (current ? { ...current, pendingFile: file, removeOriginal: false } : current));
  }

  async function saveDialog() {
    if (!dialog || dialog.mode === "view") return;
    setSaving(true); setDialogError("");
    let savedId = dialog.draft.id;
    try {
      const payload = payloadOf(dialog.draft);
      const response = dialog.mode === "create"
        ? await fetch("/api/v1/dimension-reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId, ...payload }) })
        : await fetch(`/api/v1/dimension-reports/${dialog.draft.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to save the report.");
      savedId = (body as ServerReport).id;
    } catch (e) {
      setDialogError(e instanceof Error ? e.message : "Unable to save the report.");
      setSaving(false);
      return;
    }
    try {
      if (dialog.pendingFile) {
        const file = dialog.pendingFile;
        const response = await fetch(`/api/v1/dimension-reports/${savedId}/original`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileName: file.name, mimeType: file.type, contentBase64: await fileToBase64(file) }) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message || "Unable to upload the original document.");
      } else if (dialog.removeOriginal && dialog.draft.original) {
        const response = await fetch(`/api/v1/dimension-reports/${savedId}/original`, { method: "DELETE" });
        if (!response.ok) throw new Error("Unable to remove the original document.");
      }
    } catch (e) {
      // The report itself is saved: switch the window to that report so a retry does not add a second one.
      await load();
      setDialog((current) => (current ? { ...current, mode: "edit", draft: { ...current.draft, id: savedId } } : current));
      setDialogError(`The report was saved, but the original document was not: ${e instanceof Error ? e.message : "upload failed."}`);
      setSaving(false);
      return;
    }
    await load();
    setSaving(false);
    setDialog(null);
    setNote("Report saved.");
  }

  async function removeReport(report: Report) {
    if (!(await confirm({ title: "Delete report", message: "Delete this dimensional report, its measurements and its original document? This cannot be undone.", tone: "danger", confirmLabel: "Delete report" }))) return;
    setBusyId(report.id); setError(""); setNote("");
    try {
      const response = await fetch(`/api/v1/dimension-reports/${report.id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to delete the report.");
      setReports((current) => current.filter((row) => row.id !== report.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to delete the report.");
    } finally {
      setBusyId(null);
    }
  }

  async function viewOriginal(reportId: string, inDialog = false) {
    const setMessage = inDialog ? setDialogError : setError;
    setMessage("");
    try {
      const response = await fetch(`/api/v1/dimension-reports/${reportId}/original`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to open the original document.");
      if (!openFileInNewTab(body.mimeType, body.contentBase64)) setMessage("Enable pop-ups to view the original document.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to open the original document.");
    }
  }

  async function saveFormDetails() {
    setError("");
    try {
      const response = await fetch("/api/v1/dimension-reports/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(formDraft) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to save the form details.");
      setSettings(body);
      setFormOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save the form details.");
    }
  }

  async function printReport(report: Report) {
    const win = window.open("", "_blank");
    if (!win) { setError("Enable pop-ups to print the report."); return; }
    let orgName = "";
    try {
      const r = await fetch("/api/v1/company-settings/print-details", { cache: "no-store" });
      if (r.ok) orgName = String((await r.json()).name || "");
    } catch { /* the logo / title still print without the company name */ }
    const logo = `${window.location.origin}/api/v1/company-settings/logo`;
    const MIN_ROWS = 8;
    const table = (phase: Phase, title: string) => {
      const rows = report.lines.filter((line) => line.phase === phase && lineHasContent(line));
      const blanks = Math.max(0, MIN_ROWS - rows.length);
      const cell = (value: string) => `<td>${escapeHtml(value)}</td>`;
      const body = rows.map((line) => `<tr>${cell(line.partNumber)}${cell(line.description)}${cell(line.outerDiameter)}${cell(line.innerDiameter)}${cell(line.length)}${cell(line.tolerance)}${cell(line.additionalMeasured)}<td class="c">${line.accepted === true ? "&#10003;" : ""}</td><td class="c rej">${line.accepted === false ? "&#10003;" : ""}</td></tr>`).join("")
        + Array.from({ length: blanks }, () => `<tr>${"<td>&nbsp;</td>".repeat(7)}<td class="c"></td><td class="c"></td></tr>`).join("");
      const t = totals(report.lines.filter((line) => line.phase === phase));
      return `<div class="band">${escapeHtml(title)}</div>
      <table class="grid"><thead><tr><th style="width:9%">Part</th><th style="width:17%">Description</th><th style="width:9%">OD -</th><th style="width:9%">ID -</th><th style="width:9%">Length</th><th style="width:10%">Tolerance</th><th>Additional dimensions measured:</th><th style="width:5%">Yes</th><th style="width:5%">No</th></tr></thead><tbody>${body}</tbody>
      <tfoot><tr><td colspan="9" class="total"><b>Total:</b> ${t.measured} measured &middot; ${t.accepted} accepted &middot; ${t.rejected} rejected</td></tr></tfoot></table>`;
    };
    const standardLines = (settings.standardText || "").split("\n").map((line) => line.trim()).filter(Boolean);
    win.document.write(withPoweredBy(`<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(`${jobLabel} - Dimensional size report`)}</title><style>
      @page{size:A4 landscape;margin:10mm}
      *{box-sizing:border-box}
      body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#111;font-size:11px}
      .head{display:flex;border:1px solid #333}
      .head > div{padding:8px 10px}
      .logo{width:24%;border-right:1px solid #333;display:flex;align-items:center;justify-content:center}
      .logo img{max-width:100%;max-height:70px;object-fit:contain}
      .title{flex:1;text-align:center;display:flex;flex-direction:column;justify-content:center;gap:2px;border-right:1px solid #333}
      .title .std{font-size:14px}
      .title h1{margin:2px 0 0;font-size:15px;letter-spacing:.02em}
      .ctrl{width:28%;padding:0 !important}
      .ctrl table{width:100%;height:100%;border-collapse:collapse}
      .ctrl td{border-bottom:1px solid #999;padding:3px 8px;font-size:10px}
      .ctrl tr:last-child td{border-bottom:0}
      .ctrl td:first-child{font-weight:700;width:38%;background:#e6e8ef;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .info{display:flex;gap:12px;margin:10px 0}
      .info > table{flex:1;border-collapse:collapse}
      .info td{border:1px solid #666;padding:4px 8px;height:22px}
      .info td:first-child{width:34%;font-weight:700;background:#e6e8ef;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .band{background:#e6e8ef;border:1px solid #666;border-bottom:0;padding:4px 8px;font-weight:700;margin-top:8px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      table.grid{width:100%;border-collapse:collapse;table-layout:fixed}
      table.grid th{background:#e6e8ef;border:1px solid #666;padding:4px 6px;text-align:left;font-size:10.5px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      table.grid td{border:1px solid #666;padding:3px 6px;height:21px;overflow-wrap:anywhere}
      table.grid td.c{text-align:center;font-weight:700}
      table.grid td.total{padding:5px 8px;font-size:11px}
      .gauge{margin-top:8px;font-size:11px}
      .notes{margin-top:6px;font-size:10.5px;white-space:pre-wrap}
    </style></head><body>
      <div class="head">
        <div class="logo"><img src="${escapeHtml(logo)}" alt="${escapeHtml(orgName)}" onerror="this.outerHTML='<b>${escapeHtml(orgName)}</b>'" /></div>
        <div class="title">${standardLines.map((line) => `<div class="std">${escapeHtml(line)}</div>`).join("")}<h1>DIMENSIONAL SIZE REPORT</h1></div>
        <div class="ctrl"><table>
          <tr><td>Doc. No:</td><td>${escapeHtml(settings.documentNumber || "")}</td></tr>
          <tr><td>Issue Date:</td><td>${escapeHtml(settings.issueDate || "")}</td></tr>
          <tr><td>Revision:</td><td>${escapeHtml(settings.revision || "")}</td></tr>
          <tr><td>Rev Date:</td><td>${escapeHtml(settings.revisionDate || "")}</td></tr>
          <tr><td>Page No:</td><td>1 of 1</td></tr>
        </table></div>
      </div>
      <div class="info">
        <table>
          <tr><td>Date:</td><td>${escapeHtml(report.reportDate)}</td></tr>
          <tr><td>Drawing number:</td><td>${escapeHtml(report.drawingNumber)}</td></tr>
          <tr><td>Machine:</td><td>${escapeHtml(report.machine)}</td></tr>
        </table>
        <table>
          <tr><td>Measured by:</td><td>${escapeHtml(report.measuredBy)}</td></tr>
          <tr><td>Component:</td><td>${escapeHtml(report.component)}</td></tr>
          <tr><td>Operator:</td><td>${escapeHtml(report.operator)}</td></tr>
        </table>
      </div>
      ${table("ARRIVED", "Dimensions recorded when the job arrived")}
      ${table("AFTER_MACHINING", "Dimensions recorded after machining")}
      ${report.instrument ? `<div class="gauge"><b>Gauge / instrument used:</b> ${escapeHtml(report.instrument)}</div>` : ""}
      ${report.notes ? `<div class="notes"><b>Notes:</b> ${escapeHtml(report.notes)}</div>` : ""}
      <script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
    </body></html>`));
    win.document.close();
  }

  const datalistId = useMemo(() => `dim-staff-${jobId}`, [jobId]);

  function renderTable(report: Report, phase: Phase, title: string, readOnly: boolean) {
    const allRows = report.lines.filter((line) => line.phase === phase);
    const rows = readOnly ? allRows.filter(lineHasContent) : allRows;
    const t = totals(allRows);
    const setLine = (key: string, patch: Partial<Line>) => patchDraft((r) => ({ ...r, lines: r.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)) }));
    const input = (line: Line, field: keyof Pick<Line, "partNumber" | "description" | "outerDiameter" | "innerDiameter" | "length" | "tolerance" | "additionalMeasured">, width?: number) => (
      readOnly ? <span>{line[field] || "—"}</span> : <input value={line[field]} onChange={(e) => setLine(line.key, { [field]: e.target.value })} style={{ width: "100%", minWidth: width ?? 60 }} aria-label={`${title} ${field}`} />
    );
    return (
      <div style={{ marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
          <strong style={{ fontSize: 12 }}>{title}</strong>
          {!readOnly && (
            <span style={{ display: "flex", gap: 6 }}>
              {phase === "AFTER_MACHINING" && (
                <button type="button" className="quiet-button" title="Add a row for every part recorded on arrival that is not in this table yet" onClick={() => patchDraft((r) => {
                  const have = new Set(r.lines.filter((l) => l.phase === phase).map((l) => `${l.partNumber}|${l.description}`));
                  const copies = r.lines.filter((l) => l.phase === "ARRIVED" && (l.partNumber || l.description) && !have.has(`${l.partNumber}|${l.description}`)).map((l) => ({ ...blankLine(phase), partNumber: l.partNumber, description: l.description }));
                  const kept = r.lines.filter((l) => !(l.phase === phase && !lineHasContent(l) && copies.length > 0));
                  return { ...r, lines: [...kept, ...copies] };
                })}>Copy parts from arrival</button>
              )}
              <button type="button" className="quiet-button" onClick={() => patchDraft((r) => ({ ...r, lines: [...r.lines, blankLine(phase)] }))}><Plus size={13} /> Add row</button>
            </span>
          )}
        </div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>Part</th><th>Description</th><th>OD -</th><th>ID -</th><th>Length</th><th>Tolerance</th><th>Additional dimensions measured</th><th>Accept</th>{!readOnly && <th></th>}</tr></thead>
            <tbody>
              {rows.map((line) => (
                <tr key={line.key} style={line.accepted === false ? { background: "#fff1f0" } : undefined}>
                  <td>{input(line, "partNumber", 80)}</td>
                  <td>{input(line, "description", 140)}</td>
                  <td>{input(line, "outerDiameter")}</td>
                  <td>{input(line, "innerDiameter")}</td>
                  <td>{input(line, "length")}</td>
                  <td>{input(line, "tolerance", 80)}</td>
                  <td>{input(line, "additionalMeasured", 160)}</td>
                  <td>
                    {readOnly ? <span>{line.accepted === null ? "—" : line.accepted ? "Yes" : "No"}</span> : (
                      <select value={line.accepted === null ? "" : line.accepted ? "yes" : "no"} onChange={(e) => setLine(line.key, { accepted: e.target.value === "" ? null : e.target.value === "yes" })} aria-label="Accept">
                        <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
                      </select>
                    )}
                  </td>
                  {!readOnly && <td className="actions"><button type="button" className="table-action" title="Remove row" aria-label="Remove row" onClick={() => patchDraft((r) => ({ ...r, lines: r.lines.filter((l) => l.key !== line.key) }))}><Trash2 size={13} /></button></td>}
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={readOnly ? 8 : 9} className="table-state compact-empty-state">No rows recorded.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="muted small-line" style={{ margin: "6px 0 0" }}><b>Total:</b> {t.measured} measured · {t.accepted} accepted · {t.rejected} rejected</p>
      </div>
    );
  }

  function renderDialog(state: DialogState) {
    const { mode, draft } = state;
    const readOnly = mode === "view";
    const original = state.removeOriginal ? null : draft.original;
    const title = mode === "create" ? "Add dimensional report" : mode === "edit" ? "Edit dimensional report" : "Dimensional report";
    const set = (patch: Partial<Report>) => patchDraft((r) => ({ ...r, ...patch }));
    return (
      <div className="drawer-backdrop" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => { if (e.target === e.currentTarget && readOnly) closeDialog(); }}>
        <aside className="form-drawer compact-dialog" style={{ width: "min(1100px, 96vw)", maxHeight: "92vh" }}>
          <header><div><p className="eyebrow">Specifications · {jobLabel}</p><h2>{title}</h2></div><button type="button" disabled={saving} onClick={closeDialog} aria-label="Close dialog"><X size={18} /></button></header>
          <div style={{ padding: "6px 22px 14px", overflowY: "auto" }}>
            {dialogError && <div className="inline-error" style={{ marginTop: 10 }}>{dialogError}</div>}
            <fieldset disabled={readOnly || saving} className="unstyled-fieldset">
              <div className="drawer-fields" style={{ marginTop: 8 }}>
                <label><span>Date</span><input type="date" value={draft.reportDate} onChange={(e) => set({ reportDate: e.target.value })} /></label>
                <label><span>Drawing number</span><input value={draft.drawingNumber} onChange={(e) => set({ drawingNumber: e.target.value })} /></label>
                <label><span>Machine</span><input value={draft.machine} onChange={(e) => set({ machine: e.target.value })} /></label>
                <label><span>Measured by</span><input list={datalistId} value={draft.measuredBy} onChange={(e) => set({ measuredBy: e.target.value })} /></label>
                <label><span>Component</span><input value={draft.component} onChange={(e) => set({ component: e.target.value })} /></label>
                <label><span>Operator</span><input list={datalistId} value={draft.operator} onChange={(e) => set({ operator: e.target.value })} /></label>
                <label className="wide"><span>Gauge / instrument used (with calibration reference)</span><input value={draft.instrument} onChange={(e) => set({ instrument: e.target.value })} placeholder="e.g. Mitutoyo 0-150 mm caliper, cal. ref. 2026-014" /></label>
              </div>
              {renderTable(draft, "ARRIVED", "Dimensions recorded when the job arrived", readOnly)}
              {renderTable(draft, "AFTER_MACHINING", "Dimensions recorded after machining", readOnly)}
              <div className="drawer-fields" style={{ marginTop: 10 }}>
                <label className="wide"><span>Notes</span><textarea rows={2} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} /></label>
              </div>
            </fieldset>
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #e5e7eb" }}>
              <strong style={{ fontSize: 12 }}>Original handwritten document</strong>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 8 }}>
                {state.pendingFile ? (
                  <span><FileText size={14} style={{ verticalAlign: "-2px" }} /> {state.pendingFile.name} ({formatSize(state.pendingFile.size)}) — will be uploaded when you save</span>
                ) : original ? (
                  <span><FileText size={14} style={{ verticalAlign: "-2px" }} /> {original.fileName} ({formatSize(original.sizeBytes)})</span>
                ) : (
                  <span className="muted">{readOnly ? "No original document uploaded." : "None uploaded yet. Add a photo or scan of the handwritten sheet (JPG, PNG, WebP or PDF, up to 8 MB)."}</span>
                )}
                {original && !state.pendingFile && draft.id && <button type="button" className="quiet-button" onClick={() => void viewOriginal(draft.id, true)}><Eye size={13} /> View</button>}
                {!readOnly && (
                  <>
                    <label className="quiet-button" style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <Upload size={13} /> {original || state.pendingFile ? "Replace file" : "Upload file"}
                      <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" disabled={saving} style={{ display: "none" }} onChange={(e) => { chooseOriginal(e.target.files?.[0] ?? null); e.target.value = ""; }} />
                    </label>
                    {(state.pendingFile || original) && (
                      <button type="button" className="quiet-button" disabled={saving} onClick={() => setDialog((current) => (current ? { ...current, pendingFile: null, removeOriginal: Boolean(current.draft.original) } : current))}>Remove</button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
          <footer className="detail-actions">
            {readOnly ? (
              <>
                <button type="button" className="quiet-button" onClick={() => void printReport(draft)}><Printer size={13} /> Print report</button>
                {canEdit && <button type="button" className="quiet-button" onClick={() => openReport(draft, "edit")}><Pencil size={13} /> Edit</button>}
                <button type="button" className="gold-button" onClick={closeDialog}>Close</button>
              </>
            ) : (
              <>
                <button type="button" className="quiet-button" disabled={saving} onClick={() => void printReport(draft)}><Printer size={13} /> Print report</button>
                <button type="button" className="quiet-button" disabled={saving} onClick={closeDialog}>Cancel</button>
                <button type="button" className="gold-button" disabled={saving} onClick={() => void saveDialog()}>{saving ? "Saving…" : "Save report"}</button>
              </>
            )}
          </footer>
        </aside>
      </div>
    );
  }

  return (
    <section className="detail-panel" id="job-specifications">
      <header>
        <div><h2>Specifications</h2><p>Dimensional size reports: sizes recorded when the job arrived and again after machining.</p></div>
        <div style={{ display: "flex", gap: 6 }}>
          {canManageForm && <button type="button" className="quiet-button" onClick={() => { setFormDraft(settings); setFormOpen((open) => !open); }}>Form details</button>}
          {canEdit && <button type="button" className="gold-button" onClick={openCreate}><Plus size={14} /> Add report</button>}
        </div>
      </header>
      <div style={{ padding: "0 15px 14px" }}>
        {error && <div className="inline-error" style={{ marginTop: 10 }}>{error}</div>}
        {note && <div className="inline-success" style={{ marginTop: 10 }}>{note}</div>}
        {formOpen && (
          <div className="drawer-fields" style={{ marginTop: 12 }}>
            <label className="wide"><span>Standard / heading lines (one per line, e.g. ISO 9001:2015 then Quality Management System)</span><textarea rows={2} value={formDraft.standardText ?? ""} onChange={(e) => setFormDraft((d) => ({ ...d, standardText: e.target.value }))} /></label>
            <label><span>Doc. No</span><input value={formDraft.documentNumber ?? ""} onChange={(e) => setFormDraft((d) => ({ ...d, documentNumber: e.target.value }))} /></label>
            <label><span>Issue date</span><input value={formDraft.issueDate ?? ""} onChange={(e) => setFormDraft((d) => ({ ...d, issueDate: e.target.value }))} /></label>
            <label><span>Revision</span><input value={formDraft.revision ?? ""} onChange={(e) => setFormDraft((d) => ({ ...d, revision: e.target.value }))} /></label>
            <label><span>Revision date</span><input value={formDraft.revisionDate ?? ""} onChange={(e) => setFormDraft((d) => ({ ...d, revisionDate: e.target.value }))} /></label>
            <div className="wide"><button type="button" className="gold-button" onClick={() => void saveFormDetails()}>Save form details</button></div>
          </div>
        )}
        <datalist id={datalistId}>{staff.map((name) => <option key={name} value={name} />)}</datalist>
        {loading && <div className="table-state">Loading…</div>}
        {!loading && (
          <div className="data-table-wrap" style={{ marginTop: 12 }}>
            <table className="data-table">
              <thead><tr><th>Date</th><th>Drawing number</th><th>Component</th><th>Machine</th><th>Measured by</th><th>Measurements</th><th>Original</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead>
              <tbody>
                {reports.map((report) => {
                  const arrived = totals(report.lines.filter((line) => line.phase === "ARRIVED"));
                  const after = totals(report.lines.filter((line) => line.phase === "AFTER_MACHINING"));
                  return (
                    <tr key={report.id}>
                      <td>{report.reportDate || "—"}</td>
                      <td>{report.drawingNumber || "—"}</td>
                      <td>{report.component || "—"}</td>
                      <td>{report.machine || "—"}</td>
                      <td>{report.measuredBy || "—"}</td>
                      <td>{arrived.measured} on arrival · {after.measured} after machining{after.rejected + arrived.rejected > 0 ? ` · ${arrived.rejected + after.rejected} rejected` : ""}</td>
                      <td>{report.original ? <button type="button" className="quiet-button" title={report.original.fileName} onClick={() => void viewOriginal(report.id)}><FileText size={13} /> View file</button> : <span className="muted">—</span>}</td>
                      <td className="actions" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button type="button" className="quiet-button" onClick={() => openReport(report, "view")}><Eye size={13} /> View</button>{" "}
                        <button type="button" className="quiet-button" onClick={() => void printReport(report)}><Printer size={13} /> Print report</button>{" "}
                        {canEdit && <button type="button" className="quiet-button" onClick={() => openReport(report, "edit")}><Pencil size={13} /> Edit</button>}{" "}
                        {canEdit && <button type="button" className="quiet-button" disabled={busyId === report.id} onClick={() => void removeReport(report)}><Trash2 size={13} /> Delete</button>}
                      </td>
                    </tr>
                  );
                })}
                {reports.length === 0 && <tr><td colSpan={8} className="table-state compact-empty-state">No dimensional reports on this job yet.{canEdit ? " Use Add report to start one." : ""}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {dialog ? renderDialog(dialog) : null}
      {confirmDialog}
    </section>
  );
}
