"use client";

import "./tt.css";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, Send } from "lucide-react";
import { errText, fmtDate, fmtDateTime, fmtSeconds, tt } from "./api";

type QueueItem = { certId: string; certNo: string; employee: string; position: string; course: string; requestedAt: string | null; attempts: number; elapsed: string; escalated: boolean; canDecide: boolean };
type Signoff = { enrolmentId: string; lessonKey: string; employee: string; course: string; lesson: string; task: string; canSign: boolean };
type Mentor = { id: string; course: string; courseId: string; lessonKey: string; lesson: string; employee: string; question: string; answer: string | null; answeredBy: string | null; askedAt: string | null; answeredAt: string | null };
type Review = { certId: string; certNo: string; employee: string; course: string; dueAt: string | null; overdue: boolean };
type Queue = { items: QueueItem[]; signoffs: Signoff[]; mentor: Mentor[]; reviews: Review[]; isAdmin: boolean };
type Detail = {
  certId: string; certNo: string; status: string; requestedAt: string | null; escalated: boolean;
  employee: { id: string; name: string; position: string; idNumber: string; manager: string };
  course: { id: string; title: string; code: string; revision: string; docNumber: string; passMark: number; maxAttempts: number };
  timing: { startedAt: string | null; completedAt: string | null; elapsed: string; activeSeconds: number }; preScore: number | null;
  attempts: Array<{ no: number; startedAt: string | null; submittedAt: string | null; seconds: number | null; score: number | null; passed: boolean | null; weak: string[] }>;
  attemptsUsed: number; attemptsLeft: number; lessons: { total: number; done: number; safetyPoints: number; safetyConfirmed: number }; checks: Array<{ best: number; tries: number; title: string }>;
  practical: Array<{ lessonKey: string; lesson: string; task: string; signedBy: string | null; signedAt: string | null; jobRef: string }>; enrolmentId: string;
  signAs: { name: string; title: string; hasSignature: boolean }; canDecide: boolean; whyNot: string | null;
};

const CHECKS = [
  { key: "lessons", label: "All lessons completed on the current revision" },
  { key: "quiz", label: "Final quiz passed at or above the pass mark" },
  { key: "practical", label: "Practical tasks signed off (where the course has them)" },
  { key: "discussed", label: "I have spoken to the employee about the attempts that did not pass" },
];

// Approvals (2026-11-28): certificates waiting for approval, practical sign-offs, mentor questions and 30-day effectiveness reviews.
export function ApprovalsWorkspace({ initialTab }: { initialTab?: string }) {
  const [tab, setTab] = useState(initialTab === "mentor" || initialTab === "signoffs" || initialTab === "reviews" ? initialTab : "certificates");
  const [queue, setQueue] = useState<Queue | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [prompt, setPrompt] = useState<{ title: string; label: string; action: (text: string) => Promise<void> } | null>(null);
  const [promptText, setPromptText] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [jobRefs, setJobRefs] = useState<Record<string, string>>({});
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try { const q = await tt<Queue>("approvals"); setQueue(q); setSelected((s) => s && q.items.some((i) => i.certId === s) ? s : q.items[0]?.certId ?? null); }
    catch (e) { setError(errText(e, "Unable to load approvals.")); }
  }, []);
  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t); }, [load]);
  useEffect(() => {
    const t = setTimeout(() => {
      setDetail(null); setChecks({}); setComment("");
      if (!selected) return;
      tt<Detail>(`approvals/${selected}`).then((d) => { setDetail(d); setChecks({ lessons: d.lessons.done === d.lessons.total, quiz: d.attempts.some((a) => a.passed), practical: d.practical.every((p) => p.signedBy) }); }).catch((e) => setError(errText(e, "Unable to open the certificate.")));
    }, 0);
    return () => clearTimeout(t);
  }, [selected]);

  async function decide(decision: "APPROVE" | "REJECT") {
    if (!detail) return;
    setBusy(true); setError("");
    try { await tt(`approvals/${detail.certId}/decide`, { method: "POST", body: { decision, comment, checklist: checks } }); setNotice(decision === "APPROVE" ? `Approved: certificate ${detail.certNo} issued to ${detail.employee.name}.` : `Sent back to ${detail.employee.name}.`); await load(); }
    catch (e) { setError(errText(e, "Unable to save the decision.")); }
    finally { setBusy(false); }
  }

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setError("");
    try { await fn(); if (ok) setNotice(ok); await load(); } catch (e) { setError(errText(e, "That did not work.")); } finally { setBusy(false); }
  }

  if (!queue) return error ? <div className="inline-error">{error}</div> : <div className="table-state"><Loader2 className="spin" size={20} /> Loading approvals…</div>;
  const signable = queue.signoffs.filter((s) => s.canSign);
  const unanswered = queue.mentor.filter((m) => !m.answer);
  return (
    <div className="tt">
      <header className="page-header compact"><div><p className="eyebrow">Tech Training · Managers and Company Admins</p><h1>Approvals</h1><p>A certificate is issued only after you approve it. Check the attempts and times, then approve or send it back.</p></div></header>
      <div className="tt-tabs" role="tablist">
        {([["certificates", "Certificates", queue.items.length], ["signoffs", "Practical sign-offs", signable.length], ["mentor", "Mentor questions", unanswered.length], ["reviews", "Effectiveness reviews", queue.reviews.filter((r) => r.overdue).length]] as const).map(([k, label, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setNotice(""); }}>{label}{n > 0 && <span className="tt-count">{n}</span>}</button>
        ))}
      </div>
      {error && <div className="inline-error">{error}</div>}
      {notice && <div className="tt-note ok">{notice}</div>}

      {tab === "certificates" && (queue.items.length === 0 ? <div className="tt-card tt-empty">No certificates are waiting for approval.</div> : (
        <div className="tt-split wide-right">
          <section className="tt-card">
            <header><span className="tt-sub" style={{ fontWeight: 700 }}>WAITING · {queue.items.length}</span></header>
            {queue.items.map((i) => (
              <button key={i.certId} type="button" onClick={() => setSelected(i.certId)} style={{ display: "block", width: "100%", textAlign: "left", border: 0, borderBottom: "1px solid #edeff2", padding: "12px 16px", background: selected === i.certId ? "#fbf6e6" : "#fff", boxShadow: selected === i.certId ? "inset 3px 0 0 #c9a227" : "none", cursor: "pointer", font: "inherit" }}>
                <div className="tt-bar" style={{ justifyContent: "space-between" }}><strong>{i.employee}</strong><span className="tt-sub">{fmtDate(i.requestedAt)}</span></div>
                <div style={{ fontSize: 13 }}>{i.course}</div>
                <div className="tt-sub">{i.attempts} attempt{i.attempts === 1 ? "" : "s"} · {i.elapsed}{i.escalated && <span className="tt-pill bad" style={{ marginLeft: 6 }}>Overdue</span>}{!i.canDecide && <span className="tt-pill" style={{ marginLeft: 6 }}>Not yours</span>}</div>
              </button>
            ))}
            <div className="tt-body tt-sub">Approvals not done within the escalation period go to the Company Admins.</div>
          </section>
          {!detail ? <div className="table-state"><Loader2 className="spin" size={20} /></div> : (
            <section className="tt">
              <div className="tt-card"><div className="tt-body tt-bar" style={{ justifyContent: "space-between" }}>
                <div><div style={{ fontSize: 18, fontWeight: 750 }}><Link className="tt-link" style={{ color: "#172033" }} href={`/tech-training/records/${detail.employee.id}`}>{detail.employee.name}</Link></div><div className="tt-sub">{detail.employee.position} · ID {detail.employee.idNumber}{detail.employee.manager ? ` · Manager: ${detail.employee.manager}` : ""}</div></div>
                <div style={{ textAlign: "right" }}><div style={{ fontWeight: 650 }}>{detail.course.title}</div><div className="tt-mono tt-muted">{detail.course.revision} · {detail.course.docNumber}</div></div>
              </div></div>
              <div className="tt-kpis">
                <div className="tt-kpi"><span>STARTED</span><b style={{ fontSize: 17 }}>{fmtDate(detail.timing.startedAt)}</b><span className="tt-mono">{detail.timing.startedAt ? new Date(detail.timing.startedAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false }) : ""}</span></div>
                <div className="tt-kpi"><span>COMPLETED</span><b style={{ fontSize: 17 }}>{fmtDate(detail.timing.completedAt)}</b><span className="tt-mono">{detail.timing.completedAt ? new Date(detail.timing.completedAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false }) : ""}</span></div>
                <div className="tt-kpi"><span>DURATION</span><b style={{ fontSize: 17 }}>{detail.timing.elapsed}</b><span>{fmtSeconds(detail.timing.activeSeconds)} active</span></div>
                <div className={`tt-kpi ${detail.attemptsUsed > 1 ? "warn" : ""}`}><span>QUIZ ATTEMPTS</span><b style={{ fontSize: 17 }}>{detail.attemptsUsed}</b><span>Passed on attempt {detail.attempts.find((a) => a.passed)?.no ?? "—"}</span></div>
              </div>
              <div className="tt-card">
                <header><h3>Final quiz attempts</h3><span className="tt-sub">pass mark {detail.course.passMark}%{detail.preScore !== null ? ` · pre-assessment ${detail.preScore}%` : ""}</span></header>
                <div className="data-table-wrap"><table className="data-table"><thead><tr><th>#</th><th>Started</th><th>Handed in</th><th>Time taken</th><th>Score</th><th>Result</th><th>Weakest lessons</th></tr></thead>
                  <tbody>{detail.attempts.map((a) => <tr key={a.no}><td>{a.no}</td><td className="tt-mono">{fmtDateTime(a.startedAt)}</td><td className="tt-mono">{a.submittedAt ? fmtDateTime(a.submittedAt) : "Not handed in"}</td><td>{fmtSeconds(a.seconds)}</td><td><strong>{a.score ?? "—"}{a.score !== null ? "%" : ""}</strong></td><td>{a.passed === null ? "—" : <span className={`tt-pill ${a.passed ? "ok" : "bad"}`}>{a.passed ? "Pass" : "Below pass mark"}</span>}</td><td className="tt-sub">{a.weak.join(", ") || "—"}</td></tr>)}</tbody></table></div>
                <div className="tt-body tt-sub">Lessons {detail.lessons.done} of {detail.lessons.total}{detail.lessons.safetyPoints ? ` · safety points confirmed ${detail.lessons.safetyConfirmed} of ${detail.lessons.safetyPoints}` : ""}{detail.checks.length ? ` · knowledge checks: ${detail.checks.map((c) => `${c.title} ${c.best}%`).join(", ")}` : ""}</div>
              </div>
              {detail.practical.length > 0 && (
                <div className="tt-card"><header><h3>Practical tasks</h3></header><div className="tt-body">
                  {detail.practical.map((p) => <div key={p.lessonKey} className="tt-bar"><span className={`tt-pill ${p.signedBy ? "ok" : "wait"}`}>{p.signedBy ? "Signed off" : "Not signed off"}</span><span className="tt-grow"><strong>{p.lesson}</strong> · {p.task}</span>{p.signedBy && <span className="tt-sub">{p.signedBy}, {fmtDate(p.signedAt)}{p.jobRef ? ` · ${p.jobRef}` : ""}</span>}</div>)}
                </div></div>
              )}
              <div className="tt-split" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <div className="tt-card"><header><h3>Reviewer checklist</h3></header><div className="tt-body" style={{ gap: 6 }}>
                  {CHECKS.map((c) => <label key={c.key} style={{ display: "flex", gap: 8, fontSize: 13.5 }}><input type="checkbox" checked={!!checks[c.key]} onChange={(e) => setChecks({ ...checks, [c.key]: e.target.checked })} />{c.label}</label>)}
                </div></div>
                <div className="tt-card"><header><h3>Decision</h3></header><div className="tt-body">
                  {detail.whyNot ? <div className="tt-note"><AlertTriangle size={14} /> {detail.whyNot}</div> : <>
                    <label className="tt-field">Comment (required to send back)<textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} /></label>
                    <span className="tt-sub">Signed by <strong>{detail.signAs.name}, {detail.signAs.title}</strong>, with today&apos;s date.{!detail.signAs.hasSignature && <> No signature image yet: add one under <Link className="tt-link" href="/tech-training/settings">Training settings</Link>.</>}</span>
                    <div className="tt-bar">
                      <button type="button" className="gold-button" style={{ background: "#1e7b4f", borderColor: "#145536", color: "#fff" }} disabled={busy || !detail.canDecide} onClick={() => void decide("APPROVE")}><CheckCircle2 size={14} /> Approve and issue</button>
                      <button type="button" className="danger-button" disabled={busy || !detail.canDecide} onClick={() => void decide("REJECT")}><Send size={14} /> Send back</button>
                      <button type="button" className="quiet-button" disabled={busy || !detail.canDecide} onClick={() => { setPromptText(""); setPrompt({ title: "Give more attempts", label: "Why (e.g. went through the weak lessons together)", action: async (t) => { await tt(`enrolments/${detail.enrolmentId}/reset-attempts`, { method: "POST", body: { reason: t } }); setNotice(`${detail.employee.name} has ${detail.course.maxAttempts} more attempts.`); } }); }}><RotateCcw size={14} /> Reset attempts</button>
                    </div>
                  </>}
                </div></div>
              </div>
            </section>
          )}
        </div>
      ))}

      {tab === "signoffs" && (
        <section className="master-panel"><div className="data-table-wrap"><table className="data-table">
          <thead><tr><th>Employee</th><th>Course · lesson</th><th>Task</th><th>Job</th><th></th></tr></thead>
          <tbody>
            {queue.signoffs.map((s) => (
              <tr key={`${s.enrolmentId}-${s.lessonKey}`}><td>{s.employee}</td><td>{s.course}<div className="tt-sub">{s.lesson}</div></td><td style={{ whiteSpace: "normal", maxWidth: 380 }}>{s.task}</td>
                <td><input aria-label="Job number" value={jobRefs[`${s.enrolmentId}-${s.lessonKey}`] ?? ""} onChange={(e) => setJobRefs({ ...jobRefs, [`${s.enrolmentId}-${s.lessonKey}`]: e.target.value })} placeholder="Job no." style={{ width: 110 }} /></td>
                <td>{s.canSign ? <button type="button" className="gold-button" disabled={busy} onClick={() => void run(() => tt("signoffs", { method: "POST", body: { enrolmentId: s.enrolmentId, lessonKey: s.lessonKey, jobRef: jobRefs[`${s.enrolmentId}-${s.lessonKey}`] ?? "" } }), `Signed off "${s.lesson}" for ${s.employee}.`)}>Sign off</button> : <span className="tt-sub">Their manager signs</span>}</td></tr>
            ))}
            {queue.signoffs.length === 0 && <tr><td colSpan={5} className="table-state compact-empty-state">No practical tasks are waiting to be signed off.</td></tr>}
          </tbody>
        </table></div></section>
      )}

      {tab === "mentor" && (
        <div className="tt">
          {queue.mentor.length === 0 && <div className="tt-card tt-empty">No questions yet.</div>}
          {queue.mentor.map((m) => (
            <div key={m.id} className="tt-card"><div className="tt-body">
              <div className="tt-bar"><strong>{m.employee}</strong><span className="tt-sub">on <Link className="tt-link" href={`/tech-training/lesson/${m.courseId}/${encodeURIComponent(m.lessonKey)}`}>{m.lesson}</Link> · {m.course} · {fmtDate(m.askedAt)}</span>{!m.answer && <span className="tt-pill wait">Waiting</span>}</div>
              <div style={{ whiteSpace: "pre-line" }}>{m.question}</div>
              {m.answer ? <div className="tt-note info" style={{ whiteSpace: "pre-line" }}>{m.answer}<div className="tt-sub">— {m.answeredBy}, {fmtDate(m.answeredAt)}</div></div> : (
                <div className="tt-bar" style={{ alignItems: "stretch" }}>
                  <label className="tt-field tt-grow"><textarea rows={2} aria-label="Answer" value={answers[m.id] ?? ""} onChange={(e) => setAnswers({ ...answers, [m.id]: e.target.value })} placeholder="Your answer stays on the lesson for everyone" /></label>
                  <button type="button" className="gold-button" disabled={busy || (answers[m.id] ?? "").trim().length < 2} onClick={() => void run(() => tt(`mentor/${m.id}/answer`, { method: "POST", body: { answer: answers[m.id] } }), "Answer sent.")}>Answer</button>
                </div>
              )}
            </div></div>
          ))}
        </div>
      )}

      {tab === "reviews" && (
        <section className="master-panel">
          <div className="tt-body tt-sub">ISO 9001 7.2 c: after each certificate, confirm the skill is being used on the job.</div>
          <div className="data-table-wrap"><table className="data-table">
            <thead><tr><th>Employee</th><th>Course</th><th>Due</th><th>What you saw on the job</th><th></th></tr></thead>
            <tbody>
              {queue.reviews.map((r) => (
                <tr key={r.certId}><td>{r.employee}</td><td>{r.course}<div className="tt-mono tt-muted">{r.certNo}</div></td><td>{r.overdue ? <span className="tt-pill bad">{fmtDate(r.dueAt)}</span> : fmtDate(r.dueAt)}</td>
                  <td><input aria-label="Review note" value={reviewNotes[r.certId] ?? ""} onChange={(e) => setReviewNotes({ ...reviewNotes, [r.certId]: e.target.value })} placeholder="e.g. Set relief pressure on HT-114 without help" style={{ width: "100%", minWidth: 260 }} /></td>
                  <td><div className="tt-bar" style={{ flexWrap: "nowrap" }}>
                    <button type="button" className="quiet-button" disabled={busy || (reviewNotes[r.certId] ?? "").trim().length < 5} onClick={() => void run(() => tt(`certificates/${r.certId}/review`, { method: "POST", body: { competent: true, comment: reviewNotes[r.certId] } }), "Recorded as competent.")}>Competent</button>
                    <button type="button" className="danger-button" disabled={busy || (reviewNotes[r.certId] ?? "").trim().length < 5} onClick={() => void run(() => tt(`certificates/${r.certId}/review`, { method: "POST", body: { competent: false, comment: reviewNotes[r.certId] } }), "Recorded as not yet competent. Consider assigning the course again or raising a corrective action.")}>Not yet</button>
                  </div></td></tr>
              ))}
              {queue.reviews.length === 0 && <tr><td colSpan={5} className="table-state compact-empty-state">No effectiveness reviews are due.</td></tr>}
            </tbody>
          </table></div>
        </section>
      )}

      {prompt && (
        <div className="tt-backdrop center" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setPrompt(null); }}>
          <div className="tt-dialog" role="dialog" aria-modal="true" aria-label={prompt.title}>
            <header><h2>{prompt.title}</h2><button type="button" className="tt-x" aria-label="Close" onClick={() => setPrompt(null)}>×</button></header>
            <div className="tt-body"><label className="tt-field">{prompt.label}<textarea rows={3} value={promptText} onChange={(e) => setPromptText(e.target.value)} autoFocus /></label></div>
            <footer><button type="button" className="quiet-button" onClick={() => setPrompt(null)}>Cancel</button><button type="button" className="gold-button" disabled={busy || promptText.trim().length < 5} onClick={() => void run(async () => { await prompt.action(promptText); setPrompt(null); }, "")}>Save</button></footer>
          </div>
        </div>
      )}
    </div>
  );
}
