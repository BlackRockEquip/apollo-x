"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Printer, Trash2 } from "lucide-react";
import { useConfirmDialog } from "@/components/ConfirmDialog";

// 2026-10-16, Specifications module (Engineering Business): the Dimensional Size Report on a job. Mirrors the
// paper form — a header (date, drawing number, machine, measured by, component, operator), a table of the
// dimensions recorded when the job arrived and a table recorded after machining, a Total — with a few
// improvements: parts can be copied from the arrival table to the after-machining table, the totals count
// measured / accepted / rejected, the gauge used is recorded (ISO 9001 traceability), a job can hold several
// reports, and the printout matches the company's form including its document-control block.

type Phase = "ARRIVED" | "AFTER_MACHINING";
type Line = { key: string; phase: Phase; partNumber: string; description: string; outerDiameter: string; innerDiameter: string; length: string; tolerance: string; additionalMeasured: string; accepted: boolean | null };
type Report = { id: string; reportDate: string; drawingNumber: string; machine: string; component: string; measuredBy: string; operator: string; instrument: string; notes: string; lines: Line[]; dirty: boolean };
type FormSettings = { standardText: string | null; documentNumber: string | null; issueDate: string | null; revision: string | null; revisionDate: string | null };
type ServerLine = { phase: Phase; partNumber: string | null; description: string | null; outerDiameter: string | null; innerDiameter: string | null; length: string | null; tolerance: string | null; additionalMeasured: string | null; accepted: boolean | null };
type ServerReport = { id: string; reportDate: string | null; drawingNumber: string | null; machine: string | null; component: string | null; measuredBy: string | null; operator: string | null; instrument: string | null; notes: string | null; lines: ServerLine[] };

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
    dirty: false,
  };
}

function payloadOf(report: Report) {
  const { id: _id, dirty: _dirty, lines, ...header } = report;
  void _id; void _dirty;
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

  function patchReport(id: string, change: (report: Report) => Report) {
    setReports((current) => current.map((report) => (report.id === id ? { ...change(report), dirty: true } : report)));
    setNote("");
  }

  async function addReport() {
    setBusyId("new"); setError("");
    try {
      const starter = { jobId, reportDate: todayIso(), component: defaultComponent || null, lines: [] };
      const response = await fetch("/api/v1/dimension-reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(starter) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to add the report.");
      const created = fromServer(body as ServerReport);
      created.lines = [blankLine("ARRIVED"), blankLine("AFTER_MACHINING")];
      setReports((current) => [...current, created]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to add the report.");
    } finally {
      setBusyId(null);
    }
  }

  async function saveReport(report: Report) {
    setBusyId(report.id); setError(""); setNote("");
    try {
      const response = await fetch(`/api/v1/dimension-reports/${report.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payloadOf(report)) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to save the report.");
      const saved = fromServer(body as ServerReport);
      // Keep at least one empty row per table so there is always somewhere to type.
      for (const phase of ["ARRIVED", "AFTER_MACHINING"] as Phase[]) if (!saved.lines.some((line) => line.phase === phase)) saved.lines.push(blankLine(phase));
      setReports((current) => current.map((row) => (row.id === saved.id ? saved : row)));
      setNote("Report saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save the report.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeReport(report: Report) {
    if (!(await confirm({ title: "Delete report", message: "Delete this dimensional report and all of its measurements? This cannot be undone.", tone: "danger", confirmLabel: "Delete report" }))) return;
    setBusyId(report.id); setError("");
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
    win.document.write(`<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(`${jobLabel} - Dimensional size report`)}</title><style>
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
    </body></html>`);
    win.document.close();
  }

  const datalistId = useMemo(() => `dim-staff-${jobId}`, [jobId]);

  function renderTable(report: Report, phase: Phase, title: string) {
    const rows = report.lines.filter((line) => line.phase === phase);
    const t = totals(rows);
    const setLine = (key: string, patch: Partial<Line>) => patchReport(report.id, (r) => ({ ...r, lines: r.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)) }));
    const input = (line: Line, field: keyof Pick<Line, "partNumber" | "description" | "outerDiameter" | "innerDiameter" | "length" | "tolerance" | "additionalMeasured">, width?: number) => (
      <input value={line[field]} onChange={(e) => setLine(line.key, { [field]: e.target.value })} style={{ width: "100%", minWidth: width ?? 60 }} aria-label={`${title} ${field}`} />
    );
    return (
      <div style={{ marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
          <strong style={{ fontSize: 12 }}>{title}</strong>
          {canEdit && (
            <span style={{ display: "flex", gap: 6 }}>
              {phase === "AFTER_MACHINING" && (
                <button type="button" className="quiet-button" title="Add a row for every part recorded on arrival that is not in this table yet" onClick={() => patchReport(report.id, (r) => {
                  const have = new Set(r.lines.filter((l) => l.phase === phase).map((l) => `${l.partNumber}|${l.description}`));
                  const copies = r.lines.filter((l) => l.phase === "ARRIVED" && (l.partNumber || l.description) && !have.has(`${l.partNumber}|${l.description}`)).map((l) => ({ ...blankLine(phase), partNumber: l.partNumber, description: l.description }));
                  const kept = r.lines.filter((l) => !(l.phase === phase && !lineHasContent(l) && copies.length > 0));
                  return { ...r, lines: [...kept, ...copies] };
                })}>Copy parts from arrival</button>
              )}
              <button type="button" className="quiet-button" onClick={() => patchReport(report.id, (r) => ({ ...r, lines: [...r.lines, blankLine(phase)] }))}><Plus size={13} /> Add row</button>
            </span>
          )}
        </div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>Part</th><th>Description</th><th>OD -</th><th>ID -</th><th>Length</th><th>Tolerance</th><th>Additional dimensions measured</th><th>Accept</th><th></th></tr></thead>
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
                    <select value={line.accepted === null ? "" : line.accepted ? "yes" : "no"} onChange={(e) => setLine(line.key, { accepted: e.target.value === "" ? null : e.target.value === "yes" })} aria-label="Accept">
                      <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
                    </select>
                  </td>
                  <td className="actions">{canEdit && <button type="button" className="table-action" title="Remove row" aria-label="Remove row" onClick={() => patchReport(report.id, (r) => ({ ...r, lines: r.lines.filter((l) => l.key !== line.key) }))}><Trash2 size={13} /></button>}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={9} className="table-state compact-empty-state">No rows yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="muted small-line" style={{ margin: "6px 0 0" }}><b>Total:</b> {t.measured} measured · {t.accepted} accepted · {t.rejected} rejected</p>
      </div>
    );
  }

  return (
    <section className="detail-panel" id="job-specifications">
      <header>
        <div><h2>Specifications</h2><p>Dimensional size reports: sizes recorded when the job arrived and again after machining.</p></div>
        <div style={{ display: "flex", gap: 6 }}>
          {canManageForm && <button type="button" className="quiet-button" onClick={() => { setFormDraft(settings); setFormOpen((open) => !open); }}>Form details</button>}
          {canEdit && <button type="button" className="gold-button" disabled={busyId === "new"} onClick={() => void addReport()}><Plus size={14} /> Add report</button>}
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
        {!loading && reports.length === 0 && <div className="table-state compact-empty-state">No dimensional reports on this job yet.{canEdit ? " Use Add report to start one." : ""}</div>}
        {reports.map((report, index) => (
          <div key={report.id} style={{ marginTop: 16, paddingTop: 12, borderTop: index === 0 ? "none" : "1px solid #e5e7eb" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <strong>Report {index + 1}{report.dirty ? " · unsaved changes" : ""}</strong>
              <span style={{ display: "flex", gap: 6 }}>
                <button type="button" className="quiet-button" onClick={() => void printReport(report)}><Printer size={13} /> Print</button>
                {canEdit && <button type="button" className="gold-button" disabled={busyId === report.id || !report.dirty} onClick={() => void saveReport(report)}>{busyId === report.id ? "Saving…" : "Save report"}</button>}
                {canEdit && <button type="button" className="quiet-button" disabled={busyId === report.id} onClick={() => void removeReport(report)}>Delete</button>}
              </span>
            </div>
            <fieldset disabled={!canEdit} className="unstyled-fieldset">
              <div className="drawer-fields" style={{ marginTop: 8 }}>
                <label><span>Date</span><input type="date" value={report.reportDate} onChange={(e) => patchReport(report.id, (r) => ({ ...r, reportDate: e.target.value }))} /></label>
                <label><span>Drawing number</span><input value={report.drawingNumber} onChange={(e) => patchReport(report.id, (r) => ({ ...r, drawingNumber: e.target.value }))} /></label>
                <label><span>Machine</span><input value={report.machine} onChange={(e) => patchReport(report.id, (r) => ({ ...r, machine: e.target.value }))} /></label>
                <label><span>Measured by</span><input list={datalistId} value={report.measuredBy} onChange={(e) => patchReport(report.id, (r) => ({ ...r, measuredBy: e.target.value }))} /></label>
                <label><span>Component</span><input value={report.component} onChange={(e) => patchReport(report.id, (r) => ({ ...r, component: e.target.value }))} /></label>
                <label><span>Operator</span><input list={datalistId} value={report.operator} onChange={(e) => patchReport(report.id, (r) => ({ ...r, operator: e.target.value }))} /></label>
                <label className="wide"><span>Gauge / instrument used (with calibration reference)</span><input value={report.instrument} onChange={(e) => patchReport(report.id, (r) => ({ ...r, instrument: e.target.value }))} placeholder="e.g. Mitutoyo 0-150 mm caliper, cal. ref. 2026-014" /></label>
              </div>
              {renderTable(report, "ARRIVED", "Dimensions recorded when the job arrived")}
              {renderTable(report, "AFTER_MACHINING", "Dimensions recorded after machining")}
              <div className="drawer-fields" style={{ marginTop: 10 }}>
                <label className="wide"><span>Notes</span><textarea rows={2} value={report.notes} onChange={(e) => patchReport(report.id, (r) => ({ ...r, notes: e.target.value }))} /></label>
              </div>
            </fieldset>
          </div>
        ))}
      </div>
      {confirmDialog}
    </section>
  );
}
