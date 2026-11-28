"use client";

import "./tt.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Award, CheckCircle2, ClipboardCheck, Clock, Loader2, ShieldAlert, Wrench } from "lucide-react";
import { coverUrl, errText, fmtDate, fmtDateTime, fmtSeconds, STATUS_LABEL, statusTone, tt } from "./api";

type Lesson = { key: string; title: string; topic: string; format: string; minutes: number; pages: number; done: boolean; safety: boolean; practical: { task: string; signedOff: { by: string; at: string | null } | null } | null };
type Chapter = { key: string; title: string; checkQuestions: number; check: { best: number; passed: boolean; tries: number } | null; lessons: Lesson[] };
type Data = {
  course: { id: string; code: string; title: string; group: string; completionMode: string; passMark: number; maxAttempts: number; hasCover: boolean; archived: boolean; finishBy: string | null; revision: string; docNumber: string };
  chapters: Chapter[]; objective: string; totals: { lessons: number; done: number; minutesLeft: number };
  enrolment: { id: string; status: string; startedAt: string | null; completedAt: string | null; dueDate: string | null; activeSeconds: number; attemptsUsed: number; attemptsLeft: number; preScore: number | null; lastLessonKey: string | null; updateRequired: boolean; acknowledgedAt: string | null; attempts: Array<{ no: number; startedAt: string | null; submittedAt: string | null; seconds: number | null; score: number | null; passed: boolean | null }> } | null;
  quiz: { questions: number; available: boolean; blockedBy: string | null; preAvailable: boolean };
  certificate: { certNo: string; status: string; requestedAt: string | null; decidedAt: string | null; comment: string | null } | null;
  changedSinceStart: string | null; canAcknowledge: boolean; hasProfile: boolean;
};

const BLOCKED: Record<string, string> = {
  NO_PROFILE: "Your login is not linked to an employee profile, so you can read the course but not take the quiz.",
  NO_QUIZ: "The final quiz for this course is still being prepared. Your lessons are saved; you will be able to take it once it is published.",
  LESSONS: "The quiz opens once every lesson is finished.",
  AWAITING: "You passed. Your certificate is waiting for your manager's approval.",
  CERTIFIED: "You hold the certificate for this course.",
  NO_ATTEMPTS: "You have used all your attempts. Go through the lessons to revise with your manager; they can give you more attempts.",
};

// Course page (2026-11-28): outline with progress, knowledge checks, practical sign-offs, pre-assessment, final quiz and certificate.
export function CourseView({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ackOpen, setAckOpen] = useState(false);
  const [ackTicked, setAckTicked] = useState(false);

  const load = useCallback(() => tt<Data>(`learn/courses/${courseId}`).then(setData).catch((e) => setError(errText(e, "Unable to load the course."))), [courseId]);
  useEffect(() => { void load(); }, [load]);

  if (error) return <div className="inline-error">{error}</div>;
  if (!data) return <div className="table-state"><Loader2 className="spin" size={20} /> Loading course…</div>;
  const { course, enrolment: en, totals } = data;
  const pct = totals.lessons ? Math.round((100 * totals.done) / totals.lessons) : 0;
  const firstOpen = data.chapters.flatMap((c) => c.lessons).find((l) => !l.done) ?? data.chapters[0]?.lessons[0];
  const nextKey = en?.lastLessonKey && data.chapters.some((c) => c.lessons.some((l) => l.key === en.lastLessonKey && !l.done)) ? en.lastLessonKey : firstOpen?.key;

  async function acknowledge() {
    setBusy(true);
    try { await tt(`learn/courses/${courseId}/acknowledge`, { method: "POST", body: { confirm: true } }); setAckOpen(false); await load(); }
    catch (e) { setError(errText(e, "Unable to acknowledge the course.")); }
    finally { setBusy(false); }
  }

  return (
    <div className="tt">
      <div className="tt-sub"><Link className="tt-link" href="/tech-training">Courses</Link> / {course.group}</div>
      <section className="tt-hero">
        <div style={{ flex: "1 1 420px" }}>
          <p className="eyebrow">{course.group} · {course.revision} · {course.docNumber}</p>
          <h1>{course.title}</h1>
          <p>{en?.dueDate ? `Due ${fmtDate(en.dueDate)} · ` : ""}{course.completionMode === "ACKNOWLEDGE" ? "Read every lesson, then acknowledge" : `Final quiz, pass mark ${course.passMark}%, ${course.maxAttempts} attempts`}{en?.startedAt ? ` · started ${fmtDateTime(en.startedAt)}` : ""}</p>
          <div className="tt-bar" style={{ marginTop: 12 }}><div className={`tt-meter ${pct === 100 ? "done" : ""}`} style={{ flex: 1 }}><i style={{ width: `${pct}%` }} /></div><span className="tt-mono">{totals.done} / {totals.lessons} lessons · {pct}%</span></div>
        </div>
        <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
          {course.hasCover && <span style={{ width: 160, height: 80, borderRadius: 8, background: `#0f1b2d url('${coverUrl(course.id)}') center/cover` }} />}
          {nextKey && <Link className="gold-button" href={`/tech-training/lesson/${course.id}/${encodeURIComponent(nextKey)}`}>{totals.done ? "Continue" : "Start course"} →</Link>}
          {totals.minutesLeft > 0 && <span className="tt-sub" style={{ color: "#c8d0dc" }}><Clock size={12} /> about {Math.max(1, Math.round(totals.minutesLeft))} min left</span>}
        </div>
      </section>

      {course.archived && <div className="tt-note">This course is being retired{course.finishBy ? `. Finish it by ${fmtDate(course.finishBy)}` : ""}.</div>}
      {data.changedSinceStart && <div className="tt-note info"><strong>What changed:</strong> {data.changedSinceStart}</div>}
      {en?.updateRequired && <div className="tt-note">This course was updated. Redo the lessons marked as not done, then the quiz. Your certificate stays valid meanwhile.</div>}
      {!data.hasProfile && <div className="tt-note info">Preview: your login is not linked to an employee profile, so nothing you do here is recorded.</div>}

      <div className="tt-split">
        <section className="tt-card">
          <header><h2>Course outline</h2><span className="tt-sub">{data.chapters.length} chapters</span></header>
          {data.chapters.map((ch, i) => {
            const done = ch.lessons.every((l) => l.done);
            const started = ch.lessons.some((l) => l.done);
            return (
              <div key={ch.key} className="tt-chapter">
                <div className="head">
                  <span className={`n ${done ? "done" : started ? "now" : ""}`}>{done ? "✓" : i + 1}</span>
                  <div className="tt-grow"><h3>{ch.title}</h3><span className="tt-sub">{ch.lessons.filter((l) => l.done).length} of {ch.lessons.length} lessons</span></div>
                  {ch.checkQuestions > 0 && (ch.check?.passed
                    ? <span className="tt-pill ok">Check passed {ch.check.best}%</span>
                    : data.hasProfile && <button type="button" className="quiet-button" disabled={!started} title={started ? "" : "Start the chapter first"} onClick={() => router.push(`/tech-training/quiz/${course.id}?kind=CHECK&chapter=${encodeURIComponent(ch.key)}`)}><ClipboardCheck size={13} /> Knowledge check{ch.check ? ` (best ${ch.check.best}%)` : ""}</button>)}
                </div>
                <ul className="tt-lessons">
                  {ch.lessons.map((l) => (
                    <li key={l.key}>
                      <Link href={`/tech-training/lesson/${course.id}/${encodeURIComponent(l.key)}`}>
                        <span className={`tt-tick ${l.done ? "done" : ""}`}>{l.done ? "✓" : ""}</span>
                        <span className="tt-grow">{l.title}<span className="tt-sub"> · {l.minutes} min{l.format === "PDF" ? " · PDF" : l.format === "VIDEO" ? " · video" : ""}</span></span>
                        {l.safety && <span title="Safety point" style={{ color: "#9a6400" }}><ShieldAlert size={14} /></span>}
                        {l.practical && <span className={`tt-pill ${l.practical.signedOff ? "ok" : "go"}`}><Wrench size={11} /> {l.practical.signedOff ? "Signed off" : "Practical"}</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>

        <aside className="tt">
          {data.quiz.preAvailable && (
            <div className="tt-card"><div className="tt-body">
              <div className="tt-bar"><strong>Pre-assessment</strong><span className="tt-pill new">Optional</span></div>
              <p className="tt-sub" style={{ margin: 0 }}>A short test before lesson 1 shows what you already know. It does not count towards the final quiz.</p>
              <button type="button" className="quiet-button" onClick={() => router.push(`/tech-training/quiz/${course.id}?kind=PRE`)}>Take the pre-assessment</button>
            </div></div>
          )}
          {en?.preScore !== null && en?.preScore !== undefined && <div className="tt-kpi"><b>{en.preScore}%</b><span>Pre-assessment, before the course</span></div>}

          {course.completionMode === "QUIZ_CERTIFICATE" ? (
            <div className="tt-card">
              <header><h3>Final quiz</h3>{en && <span className="tt-sub">{en.attemptsUsed} used · {en.attemptsLeft} left</span>}</header>
              <div className="tt-body">
                <p className="tt-sub" style={{ margin: 0 }}>{data.quiz.questions || "—"} questions · pass mark {course.passMark}% · every attempt is timed and recorded.</p>
                {data.quiz.blockedBy ? <div className={`tt-note ${data.quiz.blockedBy === "CERTIFIED" ? "ok" : data.quiz.blockedBy === "AWAITING" ? "" : "info"}`}>{BLOCKED[data.quiz.blockedBy] ?? ""}</div>
                  : <button type="button" className="gold-button" onClick={() => router.push(`/tech-training/quiz/${course.id}?kind=FINAL`)}>{en?.updateRequired ? "Take the update quiz" : "Start the final quiz"}</button>}
                {en && en.attempts.length > 0 && (
                  <table className="data-table"><thead><tr><th>#</th><th>Submitted</th><th>Time</th><th>Score</th></tr></thead>
                    <tbody>{en.attempts.map((a) => <tr key={a.no}><td>{a.no}</td><td>{a.submittedAt ? fmtDateTime(a.submittedAt) : <span className="tt-muted">Not handed in</span>}</td><td>{fmtSeconds(a.seconds)}</td><td>{a.score !== null ? <span className={`tt-pill ${a.passed ? "ok" : "bad"}`}>{a.score}%</span> : "—"}</td></tr>)}</tbody>
                  </table>
                )}
              </div>
            </div>
          ) : (
            <div className="tt-card"><div className="tt-body">
              <strong>Read and acknowledge</strong>
              {en?.status === "ACKNOWLEDGED" ? <div className="tt-note ok"><CheckCircle2 size={14} /> You acknowledged this on {fmtDateTime(en.acknowledgedAt)}.</div>
                : data.canAcknowledge ? <button type="button" className="gold-button" onClick={() => setAckOpen(true)}>Acknowledge the course</button>
                : <p className="tt-sub" style={{ margin: 0 }}>Finish every lesson, then confirm that you have read and understood it.</p>}
            </div></div>
          )}

          {data.certificate && (
            <div className="tt-card"><div className="tt-body">
              <div className="tt-bar"><Award size={16} /><strong>Certificate</strong><span className={`tt-pill ${statusTone(data.certificate.status)}`}>{STATUS_LABEL[data.certificate.status]}</span></div>
              <span className="tt-mono">{data.certificate.certNo}</span>
              {data.certificate.status === "REJECTED" && data.certificate.comment && <div className="tt-note bad">Sent back: {data.certificate.comment}</div>}
              {data.certificate.status === "VALID" && <Link className="gold-button" href={`/tech-training/certificates/${encodeURIComponent(data.certificate.certNo)}`}>View certificate</Link>}
            </div></div>
          )}
          {en && (
            <div className="tt-card"><div className="tt-body">
              <strong>Your record</strong>
              <div className="tt-grid2" style={{ fontSize: 12.5 }}>
                <div><span className="tt-sub">Started</span><br />{fmtDateTime(en.startedAt)}</div>
                <div><span className="tt-sub">Finished</span><br />{fmtDateTime(en.completedAt)}</div>
                <div><span className="tt-sub">Active learning</span><br />{fmtSeconds(en.activeSeconds)}</div>
                <div><span className="tt-sub">Status</span><br /><span className={`tt-pill ${statusTone(en.status)}`}>{STATUS_LABEL[en.status]}</span></div>
              </div>
            </div></div>
          )}
        </aside>
      </div>

      {ackOpen && (
        <div className="tt-backdrop center" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setAckOpen(false); }}>
          <div className="tt-dialog" role="dialog" aria-modal="true" aria-label="Acknowledge course">
            <header><h2>Acknowledge {course.title}</h2><button type="button" className="tt-x" aria-label="Close" onClick={() => setAckOpen(false)}>×</button></header>
            <div className="tt-body">
              <label className="tt-check"><input type="checkbox" checked={ackTicked} onChange={(e) => setAckTicked(e.target.checked)} /><span>I have read and understood every lesson of this course ({course.revision}) and will follow it in my work.<small>Recorded with your name, the date and the time.</small></span></label>
            </div>
            <footer><button type="button" className="quiet-button" onClick={() => setAckOpen(false)}>Cancel</button><button type="button" className="gold-button" disabled={!ackTicked || busy} onClick={() => void acknowledge()}>{busy ? <Loader2 className="spin" size={14} /> : null} Acknowledge</button></footer>
          </div>
        </div>
      )}
    </div>
  );
}
