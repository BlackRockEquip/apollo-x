"use client";

import "./tt.css";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import { Download, Loader2, Printer, Search } from "lucide-react";
import { DownloadLink } from "./DownloadLink";
import { errText, fmtDate, fmtDateTime, fmtSeconds, STATUS_LABEL, statusTone, tt } from "./api";

type ListRow = { id: string; name: string; position: string; status: string; required: number; requiredDone: number; certified: number; inProgress: number; awaiting: number; overdue: number };

// Training records list (2026-11-28).
export function RecordsList() {
  const [rows, setRows] = useState<ListRow[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { const t = setTimeout(() => { tt<{ items: ListRow[] }>(`records?q=${encodeURIComponent(q)}`).then((d) => setRows(d.items)).catch((e) => setError(errText(e, "Unable to load records."))); }, q ? 250 : 0); return () => clearTimeout(t); }, [q]);
  return (
    <div className="tt">
      <header className="page-header compact">
        <div><p className="eyebrow">Tech Training · ISO 9001 clause 7.2</p><h1>Training records</h1><p>Each person&apos;s training: courses, start and end dates and times, attempts, approvals and the audit trail.</p></div>
        <div className="tt-bar"><DownloadLink href="/api/v1/tech-training/exports/competence"><Download size={14} /> Competence records (CSV)</DownloadLink></div>
      </header>
      {error && <div className="inline-error">{error}</div>}
      <section className="master-panel">
        <div className="master-toolbar"><label className="search-control"><Search size={15} /><input aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or employee number" /></label></div>
        {!rows ? <div className="table-state"><Loader2 className="spin" size={20} /></div> : (
          <div className="data-table-wrap"><table className="data-table">
            <thead><tr><th>Employee</th><th>Position</th><th>Required done</th><th>Certified</th><th>In progress</th><th>Awaiting approval</th><th>Overdue</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((r) => <tr key={r.id} className={r.status === "INACTIVE" ? "inactive" : ""}><td><Link className="tt-link" style={{ color: "#172033" }} href={`/tech-training/records/${r.id}`}>{r.name}</Link></td><td>{r.position}</td><td className="tt-mono">{r.required ? `${r.requiredDone}/${r.required}` : "—"}</td><td>{r.certified}</td><td>{r.inProgress}</td><td>{r.awaiting || ""}</td><td>{r.overdue ? <span className="tt-pill bad">{r.overdue}</span> : ""}</td><td><span className={`tt-pill ${statusTone(r.status)}`}>{STATUS_LABEL[r.status]}</span></td></tr>)}
              {rows.length === 0 && <tr><td colSpan={8} className="table-state compact-empty-state">No employees.</td></tr>}
            </tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}

type Course = {
  enrolmentId: string; courseId: string; course: string; code: string; revision: string; required: boolean; mode: string; status: string; dueDate: string | null; overdue: boolean;
  startedAt: string | null; completedAt: string | null; elapsed: string; active: string; activeSeconds: number; attempts: number; finalScore: number | null; preScore: number | null;
  attemptList: Array<{ no: number; startedAt: string | null; submittedAt: string | null; seconds: number | null; score: number | null; passed: boolean | null }>;
  certificate: { id: string; certNo: string; status: string; approvedBy: string; approvedAt: string | null; reviewDueAt: string | null; reviewedAt: string | null; reviewedBy: string; competent: boolean | null; reviewComment: string | null; revokedReason: string | null } | null;
  acknowledgedAt: string | null; withdrawnReason: string | null; updateRequired: boolean;
};
type Record_ = {
  employee: { id: string; firstName: string; surname: string; name: string; idNumber: string; email: string; employeeNo: string; position: string; manager: string; status: string; hasLogin: boolean };
  summary: { requiredDone: number; required: number; avgAttempts: number | null; activeSeconds: number; certificates: number };
  courses: Course[]; events: Array<{ id: string; at: string | null; action: string; by: string; data: Record<string, unknown> | null; reason: string | null }>; retentionYears: number;
};

const ACTIONS: Record<string, string> = {
  TRAINING_EMPLOYEE_CREATED: "Employee profile created", TRAINING_EMPLOYEE_UPDATED: "Profile changed", TRAINING_EMPLOYEE_DEACTIVATED: "Deactivated", TRAINING_EMPLOYEE_REACTIVATED: "Reactivated",
  TRAINING_COURSE_ASSIGNED: "Course assigned", TRAINING_COURSE_STARTED: "Started course", TRAINING_LESSON_COMPLETED: "Lesson completed", TRAINING_QUIZ_STARTED: "Quiz attempt started",
  TRAINING_QUIZ_PASSED: "Passed quiz", TRAINING_QUIZ_FAILED: "Quiz below pass mark", TRAINING_CERTIFICATE_REQUESTED: "Certificate requested", TRAINING_CERTIFICATE_APPROVED: "Certificate approved",
  TRAINING_CERTIFICATE_REJECTED: "Certificate sent back", TRAINING_CERTIFICATE_REVOKED: "Certificate revoked", TRAINING_ATTEMPTS_RESET: "More attempts given", TRAINING_PRACTICAL_SIGNED_OFF: "Practical task signed off",
  TRAINING_EFFECTIVENESS_REVIEWED: "Effectiveness review", TRAINING_COURSE_ACKNOWLEDGED: "Course acknowledged", TRAINING_ENROLMENT_WITHDRAWN: "Course withdrawn", TRAINING_MENTOR_QUESTION_ASKED: "Asked a mentor", TRAINING_MENTOR_ANSWERED: "Mentor answered",
};

function eventText(e: Record_["events"][number]): string {
  const d = (e.data ?? {}) as Record<string, unknown>;
  const bits = [d.course, d.lesson, d.attemptNo ? `attempt ${d.attemptNo}` : null, d.score !== undefined ? `${d.score}%` : null, d.certNo, d.position].filter(Boolean);
  return `${ACTIONS[e.action] ?? e.action}${bits.length ? `: ${bits.join(" · ")}` : ""}${e.reason ? ` (${e.reason})` : ""}`;
}

// One employee's training record (2026-11-28): the ISO 9001 7.2 competence evidence, printable as a PDF pack.
export function EmployeeRecord({ employeeId, canRevoke, canManage }: { employeeId: string; canRevoke: boolean; canManage: boolean }) {
  const [rec, setRec] = useState<Record_ | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<{ title: string; path: string } | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => tt<Record_>(`employees/${employeeId}/record`).then(setRec).catch((e) => setError(errText(e, "Unable to load the record."))), [employeeId]);
  useEffect(() => { void load(); }, [load]);

  function print() {
    document.body.classList.add("tt-printing-record");
    const done = () => { document.body.classList.remove("tt-printing-record"); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    window.print();
  }

  async function act() {
    if (!prompt) return;
    setBusy(true);
    try { await tt(prompt.path, { method: "POST", body: { reason: text } }); setPrompt(null); setText(""); await load(); }
    catch (e) { setError(errText(e, "That did not work.")); }
    finally { setBusy(false); }
  }

  if (error && !rec) return <div className="inline-error">{error}</div>;
  if (!rec) return <div className="table-state"><Loader2 className="spin" size={20} /> Loading record…</div>;
  const e = rec.employee;
  return (
    <div className="tt">
      <div className="tt-sub tt-noprint"><Link className="tt-link" href="/tech-training/records">Training records</Link> / {e.name}</div>
      <header className="page-header compact">
        <div><p className="eyebrow">Training record · ISO 9001 clause 7.2 evidence</p><h1>{e.name}</h1><p>Printed {fmtDateTime(new Date().toISOString())} · records kept {rec.retentionYears} years</p></div>
        <div className="tt-bar tt-noprint">
          {canManage && <Link className="quiet-button" href="/tech-training/employees">Edit profile</Link>}
          <button type="button" className="gold-button" onClick={print}><Printer size={14} /> Competence pack (print / PDF)</button>
        </div>
      </header>
      {error && <div className="inline-error">{error}</div>}
      <div className="tt-card"><div className="tt-body tt-grid3" style={{ gridTemplateColumns: "repeat(6, minmax(0,1fr))" }}>
        {[["Name", e.firstName], ["Surname", e.surname], ["ID number", e.idNumber], ["Position", e.position], ["Email address", e.email], ["Manager", e.manager || "—"]].map(([k, v]) => <div key={k}><div className="tt-sub" style={{ fontWeight: 700, letterSpacing: ".05em" }}>{k.toUpperCase()}</div><div style={{ fontWeight: 600, wordBreak: "break-word" }} className={k === "ID number" ? "tt-mono" : ""}>{v}</div></div>)}
      </div></div>
      <div className="tt-kpis">
        <div className="tt-kpi"><b>{rec.summary.required ? `${rec.summary.requiredDone} of ${rec.summary.required}` : "—"}</b><span>Required courses done</span></div>
        <div className="tt-kpi"><b>{rec.summary.avgAttempts ?? "—"}</b><span>Average quiz attempts to pass</span></div>
        <div className="tt-kpi"><b>{fmtSeconds(rec.summary.activeSeconds)}</b><span>Active learning time</span></div>
        <div className="tt-kpi good"><b>{rec.summary.certificates}</b><span>Valid certificates</span></div>
      </div>
      <section className="tt-card">
        <header><h3>Courses</h3></header>
        <div className="data-table-wrap"><table className="data-table">
          <thead><tr><th>Course · revision</th><th>Started</th><th>Completed</th><th>Duration</th><th>Attempts</th><th>Final score</th><th>Status</th><th>Certificate</th><th>Approved by</th><th className="tt-noprint"></th></tr></thead>
          <tbody>
            {rec.courses.map((c) => (
              <Fragment key={c.enrolmentId}>
                <tr>
                  <td><strong>{c.course}</strong>{c.required && <span className="tt-pill wait" style={{ marginLeft: 6 }}>Required</span>}<div className="tt-sub">{c.code} · {c.revision}{c.dueDate ? ` · due ${fmtDate(c.dueDate)}` : ""}</div></td>
                  <td className="tt-mono">{fmtDateTime(c.startedAt)}</td><td className="tt-mono">{fmtDateTime(c.completedAt)}</td>
                  <td>{c.elapsed}<div className="tt-sub">{c.active} active</div></td>
                  <td><strong>{c.attempts || "—"}</strong></td><td>{c.finalScore !== null ? `${c.finalScore}%` : "—"}{c.preScore !== null && <div className="tt-sub">pre {c.preScore}%</div>}</td>
                  <td><span className={`tt-pill ${statusTone(c.status)}`}>{STATUS_LABEL[c.status]}</span>{c.overdue && <span className="tt-pill bad" style={{ marginLeft: 4 }}>Overdue</span>}{c.withdrawnReason && <div className="tt-sub">{c.withdrawnReason}</div>}</td>
                  <td className="tt-mono">{c.certificate ? <>{c.certificate.status === "VALID" ? <Link className="tt-link" href={`/tech-training/certificates/${encodeURIComponent(c.certificate.certNo)}`}>{c.certificate.certNo}</Link> : c.certificate.certNo}<div><span className={`tt-pill ${statusTone(c.certificate.status)}`}>{STATUS_LABEL[c.certificate.status]}</span></div></> : c.acknowledgedAt ? `Acknowledged ${fmtDate(c.acknowledgedAt)}` : "—"}</td>
                  <td>{c.certificate?.approvedBy ? <>{c.certificate.approvedBy}<div className="tt-sub">{fmtDateTime(c.certificate.approvedAt)}</div></> : "—"}</td>
                  <td className="tt-noprint"><button type="button" className="tt-link" onClick={() => setOpen(open === c.enrolmentId ? null : c.enrolmentId)}>{open === c.enrolmentId ? "Less" : "More"}</button></td>
                </tr>
                {open === c.enrolmentId && (
                  <tr><td colSpan={10} style={{ background: "#fafbfc", whiteSpace: "normal" }}>
                    <div className="tt-bar" style={{ alignItems: "flex-start", gap: 20 }}>
                      <div className="tt-grow">
                        <strong>Attempts</strong>
                        {c.attemptList.length ? <ul style={{ margin: "4px 0", paddingLeft: 18 }}>{c.attemptList.map((a) => <li key={a.no}>#{a.no}: started {fmtDateTime(a.startedAt)}, {a.submittedAt ? `handed in ${fmtDateTime(a.submittedAt)} (${fmtSeconds(a.seconds)})` : "not handed in"} — {a.score !== null ? `${a.score}% ${a.passed ? "pass" : "below pass mark"}` : "no score"}</li>)}</ul> : <div className="tt-sub">None</div>}
                        {c.certificate?.reviewedAt ? <div><strong>Effectiveness review:</strong> {c.certificate.competent ? "competent" : "not yet competent"} — {c.certificate.reviewComment} ({c.certificate.reviewedBy}, {fmtDate(c.certificate.reviewedAt)})</div> : c.certificate?.reviewDueAt && <div className="tt-sub">Effectiveness review due {fmtDate(c.certificate.reviewDueAt)}</div>}
                        {c.certificate?.revokedReason && <div className="tt-note bad">Revoked: {c.certificate.revokedReason}</div>}
                      </div>
                      <div className="tt-bar">
                        {canManage && !["CERTIFIED", "ACKNOWLEDGED", "WITHDRAWN"].includes(c.status) && <button type="button" className="quiet-button" onClick={() => { setText(""); setPrompt({ title: `Withdraw ${c.course}`, path: `enrolments/${c.enrolmentId}/withdraw` }); }}>Withdraw course</button>}
                        {canManage && c.status !== "CERTIFIED" && c.mode === "QUIZ_CERTIFICATE" && <button type="button" className="quiet-button" onClick={() => { setText(""); setPrompt({ title: "Give more attempts", path: `enrolments/${c.enrolmentId}/reset-attempts` }); }}>Reset attempts</button>}
                        {canRevoke && c.certificate?.status === "VALID" && <button type="button" className="danger-button" onClick={() => { setText(""); setPrompt({ title: `Revoke ${c.certificate!.certNo}`, path: `certificates/${c.certificate!.id}/revoke` }); }}>Revoke certificate</button>}
                      </div>
                    </div>
                  </td></tr>
                )}
              </Fragment>
            ))}
            {rec.courses.length === 0 && <tr><td colSpan={10} className="table-state compact-empty-state">No courses yet.</td></tr>}
          </tbody>
        </table></div>
      </section>
      <section className="tt-card">
        <header><h3>Audit trail</h3><span className="tt-sub">Cannot be edited or deleted</span></header>
        <div className="tt-body"><div className="tt-timeline">
          {rec.events.map((ev) => <div key={ev.id}><span className="when">{fmtDateTime(ev.at)}</span><span>{eventText(ev)}</span><span className="tt-sub">{ev.by}</span></div>)}
          {rec.events.length === 0 && <span className="tt-sub">Nothing recorded yet.</span>}
        </div></div>
      </section>
      {prompt && (
        <div className="tt-backdrop center tt-noprint" role="presentation" onMouseDown={(ev) => { if (ev.target === ev.currentTarget) setPrompt(null); }}>
          <div className="tt-dialog" role="dialog" aria-modal="true" aria-label={prompt.title}>
            <header><h2>{prompt.title}</h2><button type="button" className="tt-x" aria-label="Close" onClick={() => setPrompt(null)}>×</button></header>
            <div className="tt-body"><label className="tt-field">Reason (kept in the audit trail)<textarea rows={3} value={text} onChange={(ev) => setText(ev.target.value)} autoFocus /></label></div>
            <footer><button type="button" className="quiet-button" onClick={() => setPrompt(null)}>Cancel</button><button type="button" className="gold-button" disabled={busy || text.trim().length < 5} onClick={() => void act()}>Save</button></footer>
          </div>
        </div>
      )}
    </div>
  );
}
