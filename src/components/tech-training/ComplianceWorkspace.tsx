"use client";

import "./tt.css";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Download, Loader2, Plus, XCircle } from "lucide-react";
import { DownloadLink } from "./DownloadLink";
import { errText, fmtDate, STATUS_LABEL, statusTone, tt } from "./api";

type Data = {
  kpis: { requiredPct: number | null; overdue: number; avgAttempts: number | null; reviewsPct: number | null; notCompetent: number };
  matrix: { courses: Array<{ id: string; code: string; title: string }>; rows: Array<{ employeeId: string; name: string; position: string; cells: Array<{ courseId: string; cell: string; pct: number }> }> };
  documents: Array<{ courseId: string; docNumber: string; title: string; status: string; revision: string; approvedBy: string; effective: string | null; nextReview: string | null; reviewOverdue: boolean; reviewSoon: boolean; owner: string; avgAttempts: number | null }>;
  controls: Array<{ ref: string; text: string; ok: boolean; detail: string }>;
  trouble: Array<{ questionKey: string; prompt: string; asked: number; wrong: number; course: string; courseId?: string }>;
  actions: Array<{ id: string; ref: string; title: string; detail: string; status: string; dueDate: string | null; course: string; raisedBy: string; createdAt: string | null; closedAt: string | null; closeNote: string | null }>;
  courses: Array<{ id: string; title: string }>;
  canAct: boolean;
};

const CELL: Record<string, string> = { CERTIFIED: "✓", ACKNOWLEDGED: "✓", AWAITING: "R", OVERDUE: "!", IN_PROGRESS: "", ASSIGNED: "A", NOT_STARTED: "·", NOT_REQUIRED: "–" };

// ISO and compliance (2026-11-28): training matrix, controlled course documents, ISO 9001 controls, corrective actions, exports.
export function ComplianceWorkspace() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [action, setAction] = useState<{ id: string | null; title: string; detail: string; courseId: string; dueDate: string; close?: boolean; closeNote?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const year = new Date().getFullYear();
  const load = useCallback(() => tt<Data>("compliance").then(setData).catch((e) => setError(errText(e, "Unable to load compliance."))), []);
  useEffect(() => { void load(); }, [load]);

  async function saveAction() {
    if (!action) return;
    setBusy(true);
    try { await tt(action.id ? `actions/${action.id}` : "actions", { method: action.id ? "PUT" : "POST", body: { title: action.title, detail: action.detail, courseId: action.courseId || null, dueDate: action.dueDate || null, close: action.close, closeNote: action.closeNote } }); setAction(null); await load(); }
    catch (e) { setError(errText(e, "Unable to save the action.")); }
    finally { setBusy(false); }
  }

  if (error && !data) return <div className="inline-error">{error}</div>;
  if (!data) return <div className="table-state"><Loader2 className="spin" size={20} /> Loading…</div>;
  return (
    <div className="tt">
      <header className="page-header compact">
        <div><p className="eyebrow">ISO 9001:2015 · clauses 7.2 competence and 7.5 documented information</p><h1>ISO and compliance</h1><p>Non-credit-bearing training, run and recorded to the same standard as accredited training.</p></div>
        <div className="tt-bar">
          <DownloadLink href="/api/v1/tech-training/exports/matrix"><Download size={14} /> Training matrix</DownloadLink>
          <DownloadLink href="/api/v1/tech-training/exports/competence"><Download size={14} /> Competence records</DownloadLink>
          <DownloadLink href={`/api/v1/tech-training/exports/seta?year=${year}`}><Download size={14} /> SETA list {year}</DownloadLink>
          <DownloadLink href="/api/v1/tech-training/exports/audit"><Download size={14} /> Audit trail</DownloadLink>
        </div>
      </header>
      {error && <div className="inline-error">{error}</div>}
      <div className="tt-kpis">
        <div className="tt-kpi"><b>{data.kpis.requiredPct ?? "—"}{data.kpis.requiredPct !== null ? "%" : ""}</b><span>Required training certified</span></div>
        <div className={`tt-kpi ${data.kpis.overdue ? "bad" : ""}`}><b>{data.kpis.overdue}</b><span>Enrolments past due date</span></div>
        <div className="tt-kpi"><b>{data.kpis.avgAttempts ?? "—"}</b><span>Average attempts to pass</span></div>
        <div className="tt-kpi"><b>{data.kpis.reviewsPct ?? "—"}{data.kpis.reviewsPct !== null ? "%" : ""}</b><span>Effectiveness reviews done on time</span></div>
        <div className={`tt-kpi ${data.kpis.notCompetent ? "warn" : ""}`}><b>{data.kpis.notCompetent}</b><span>Not yet competent on the job</span></div>
      </div>

      <section className="tt-card">
        <header><h3>Training matrix</h3><span className="tt-sub">✓ done · R awaiting approval · ! overdue · % in progress · A assigned · · required, not started · – not required</span></header>
        <div className="data-table-wrap"><table className="data-table tt-matrix">
          <thead><tr><th>Employee</th>{data.matrix.courses.map((c) => <th key={c.id} title={c.title} className="course">{c.code}</th>)}</tr></thead>
          <tbody>
            {data.matrix.rows.map((r) => <tr key={r.employeeId}><td><Link className="tt-link" style={{ color: "#172033" }} href={`/tech-training/records/${r.employeeId}`}>{r.name}</Link><div className="tt-sub">{r.position}</div></td>{r.cells.map((c) => <td key={c.courseId}><span className={`tt-cell ${c.cell}`}>{c.cell === "IN_PROGRESS" ? `${c.pct}%` : CELL[c.cell]}</span></td>)}</tr>)}
            {data.matrix.rows.length === 0 && <tr><td colSpan={data.matrix.courses.length + 1} className="table-state compact-empty-state">No active employees yet.</td></tr>}
          </tbody>
        </table></div>
      </section>

      <div className="tt-split">
        <section className="tt-card">
          <header><h3>Controlled course documents</h3></header>
          <div className="data-table-wrap"><table className="data-table">
            <thead><tr><th>Doc no.</th><th>Course</th><th>Rev</th><th>Approved by</th><th>Effective</th><th>Next review</th><th>Avg attempts</th></tr></thead>
            <tbody>
              {data.documents.map((d) => <tr key={d.courseId}><td className="tt-mono">{d.docNumber}</td><td><Link className="tt-link" style={{ color: "#172033" }} href={`/tech-training/manage/${d.courseId}`}>{d.title}</Link>{d.status !== "PUBLISHED" && <span className={`tt-pill ${statusTone(d.status)}`} style={{ marginLeft: 6 }}>{STATUS_LABEL[d.status]}</span>}<div className="tt-sub">Owner: {d.owner || "—"}</div></td><td>{d.revision}</td><td>{d.approvedBy}</td><td>{fmtDate(d.effective)}</td><td>{d.reviewOverdue ? <span className="tt-pill bad">{fmtDate(d.nextReview)}</span> : d.reviewSoon ? <span className="tt-pill wait">{fmtDate(d.nextReview)}</span> : fmtDate(d.nextReview)}</td><td>{d.avgAttempts ?? "—"}</td></tr>)}
              {data.documents.length === 0 && <tr><td colSpan={7} className="table-state compact-empty-state">No published courses yet.</td></tr>}
            </tbody>
          </table></div>
          <div className="tt-body tt-sub">Every published revision is frozen and kept. Certificates show the revision they were earned on.</div>
        </section>
        <aside className="tt">
          <div className="tt-card"><header><h3>ISO controls</h3></header><div className="tt-body" style={{ gap: 4 }}>
            {data.controls.map((c) => <div key={c.ref} style={{ display: "grid", gridTemplateColumns: "22px 1fr auto", gap: 8, padding: "6px 0", borderBottom: "1px solid #edeff2", fontSize: 13 }}>{c.ok ? <CheckCircle2 size={18} color="#1e7b4f" /> : <XCircle size={18} color="#b42318" />}<span>{c.text}<div className="tt-sub">{c.detail}</div></span><span className="tt-mono tt-muted">{c.ref}</span></div>)}
          </div></div>
          {data.trouble.length > 0 && (
            <div className="tt-card"><header><h3>Questions most people get wrong</h3></header><div className="tt-body">
              {data.trouble.map((t) => <div key={t.questionKey} style={{ fontSize: 13, borderBottom: "1px solid #edeff2", paddingBottom: 6 }}><strong>{Math.round((100 * t.wrong) / t.asked)}% wrong</strong> ({t.wrong} of {t.asked}) · {t.course}<div>{t.prompt}</div>{data.canAct && <button type="button" className="tt-link" onClick={() => setAction({ id: null, title: `Review question: ${t.prompt.slice(0, 80)}`, detail: `${t.wrong} of ${t.asked} answers wrong. Check whether the lesson explains this clearly or the question is unclear.`, courseId: data.courses.find((c) => c.title === t.course)?.id ?? "", dueDate: "" })}>Raise corrective action</button>}</div>)}
            </div></div>
          )}
        </aside>
      </div>

      <section className="tt-card">
        <header><h3>Corrective actions</h3><span className="tt-grow" />{data.canAct && <button type="button" className="quiet-button" onClick={() => setAction({ id: null, title: "", detail: "", courseId: "", dueDate: "" })}><Plus size={14} /> Raise action</button>}</header>
        <div className="data-table-wrap"><table className="data-table">
          <thead><tr><th>Ref</th><th>Action</th><th>Course</th><th>Due</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {data.actions.map((a) => <tr key={a.id}><td className="tt-mono">{a.ref}</td><td style={{ whiteSpace: "normal" }}><strong>{a.title}</strong>{a.detail && <div className="tt-sub">{a.detail}</div>}{a.closeNote && <div className="tt-sub">Closed: {a.closeNote}</div>}</td><td>{a.course || "—"}</td><td>{fmtDate(a.dueDate)}</td><td><span className={`tt-pill ${statusTone(a.status)}`}>{STATUS_LABEL[a.status]}</span></td><td>{data.canAct && a.status === "OPEN" && <button type="button" className="quiet-button" onClick={() => setAction({ id: a.id, title: a.title, detail: a.detail, courseId: data.courses.find((c) => c.title === a.course)?.id ?? "", dueDate: a.dueDate?.slice(0, 10) ?? "", close: true, closeNote: "" })}>Close</button>}</td></tr>)}
            {data.actions.length === 0 && <tr><td colSpan={6} className="table-state compact-empty-state">No corrective actions.</td></tr>}
          </tbody>
        </table></div>
      </section>

      {action && (
        <div className="tt-backdrop center" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setAction(null); }}>
          <div className="tt-dialog" role="dialog" aria-modal="true" aria-label="Corrective action">
            <header><h2>{action.close ? "Close corrective action" : action.id ? "Corrective action" : "Raise a corrective action"}</h2><button type="button" className="tt-x" aria-label="Close" onClick={() => setAction(null)}>×</button></header>
            <div className="tt-body">
              <label className="tt-field">Title<input value={action.title} onChange={(e) => setAction({ ...action, title: e.target.value })} disabled={action.close} /></label>
              <label className="tt-field">Detail<textarea rows={3} value={action.detail} onChange={(e) => setAction({ ...action, detail: e.target.value })} disabled={action.close} /></label>
              <div className="tt-grid2">
                <label className="tt-field">Course<select value={action.courseId} onChange={(e) => setAction({ ...action, courseId: e.target.value })} disabled={action.close}><option value="">—</option>{data.courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
                <label className="tt-field">Due date<input type="date" value={action.dueDate} onChange={(e) => setAction({ ...action, dueDate: e.target.value })} disabled={action.close} /></label>
              </div>
              {action.close && <label className="tt-field">What was done to close it<textarea rows={3} value={action.closeNote ?? ""} onChange={(e) => setAction({ ...action, closeNote: e.target.value })} autoFocus /></label>}
            </div>
            <footer><button type="button" className="quiet-button" onClick={() => setAction(null)}>Cancel</button><button type="button" className="gold-button" disabled={busy || action.title.trim().length < 3 || (action.close && (action.closeNote ?? "").trim().length < 3)} onClick={() => void saveAction()}>{action.close ? "Close action" : "Save"}</button></footer>
          </div>
        </div>
      )}
    </div>
  );
}
