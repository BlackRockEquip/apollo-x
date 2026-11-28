"use client";

import "./tt.css";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Award, Loader2 } from "lucide-react";
import { errText, fmtSeconds, tt } from "./api";

type Started = { attemptId: string; kind: "FINAL" | "PRE" | "CHECK"; attemptNo: number; passMark: number | null; questions: Array<{ id: string; prompt: string; options: string[]; multi: boolean }> };
type Result = { kind: string; score: number; correct: number; total: number; passed: boolean; passMark: number; weakLessons: Array<{ key: string; title: string }>; review: Array<{ id: string; correct: boolean; answer: number[]; explanation: string }> | null; certificate: { certNo: string } | null; attemptsLeft: number; seconds: number };
type CourseInfo = { course: { title: string; passMark: number; maxAttempts: number }; enrolment: { attemptsLeft: number; attemptsUsed: number } | null; chapters: Array<{ key: string; title: string }> };

const TITLES = { FINAL: "Final quiz", PRE: "Pre-assessment", CHECK: "Knowledge check" } as const;

// Quiz (2026-11-28): one question per screen. A final attempt counts as soon as it starts, so the intro says so first.
export function QuizRunner({ courseId, kind, chapterKey }: { courseId: string; kind: "FINAL" | "PRE" | "CHECK"; chapterKey: string }) {
  const [info, setInfo] = useState<CourseInfo | null>(null);
  const [quiz, setQuiz] = useState<Started | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number[]>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { tt<CourseInfo>(`learn/courses/${courseId}`).then(setInfo).catch((e) => setError(errText(e, "Unable to load the course."))); }, [courseId]);

  async function start() {
    setBusy(true); setError("");
    try { setQuiz(await tt<Started>(`learn/courses/${courseId}/quiz`, { method: "POST", body: { kind, chapterKey } })); setIndex(0); setAnswers({}); }
    catch (e) { setError(errText(e, "Unable to start.")); }
    finally { setBusy(false); }
  }

  async function submit() {
    if (!quiz) return;
    setBusy(true); setError("");
    try { setResult(await tt<Result>(`learn/attempts/${quiz.attemptId}`, { method: "POST", body: { answers } })); window.scrollTo({ top: 0 }); }
    catch (e) { setError(errText(e, "Unable to hand in the quiz.")); }
    finally { setBusy(false); }
  }

  function pick(qid: string, opt: number, multi: boolean) {
    setAnswers((a) => {
      const cur = a[qid] ?? [];
      return { ...a, [qid]: multi ? (cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt]) : [opt] };
    });
  }

  const title = TITLES[kind];
  const chapterTitle = info?.chapters.find((c) => c.key === chapterKey)?.title;
  const back = <Link className="tt-link" href={`/tech-training/course/${courseId}`}>← Back to the course</Link>;

  if (result && quiz) {
    const pass = result.kind === "PRE" ? true : result.passed;
    return (
      <div className="tt" style={{ maxWidth: 860 }}>
        {back}
        <div className={`tt-score ${pass ? "pass" : "fail"}`}>
          <span className="eyebrow">{title}{chapterTitle ? ` · ${chapterTitle}` : ""}</span>
          <b>{result.score}%</b>
          <span>{result.correct} of {result.total} right · {fmtSeconds(result.seconds)}{result.kind !== "PRE" ? ` · pass mark ${result.passMark}%` : ""}</span>
          {result.kind === "FINAL" && (result.passed
            ? <strong><Award size={15} /> Passed. Your certificate ({result.certificate?.certNo}) has gone to your manager for approval.</strong>
            : <strong>Not yet. {result.attemptsLeft > 0 ? `${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? "" : "s"} left.` : "No attempts left: speak to your manager."}</strong>)}
          {result.kind === "PRE" && <strong>Thanks. This shows where you start; it does not count towards the course.</strong>}
          {result.kind === "CHECK" && <strong>{result.passed ? "Chapter check passed." : "Have another look at the lessons below, then try again."}</strong>}
        </div>
        {result.weakLessons.length > 0 && (
          <div className="tt-card"><div className="tt-body">
            <strong>Revise these lessons</strong>
            <ul style={{ margin: 0, paddingLeft: 20 }}>{result.weakLessons.map((w) => <li key={w.key}><Link className="tt-link" href={`/tech-training/lesson/${courseId}/${encodeURIComponent(w.key)}`}>{w.title}</Link></li>)}</ul>
          </div></div>
        )}
        {result.review && (
          <div className="tt">
            {quiz.questions.map((q, i) => {
              const r = result.review!.find((x) => x.id === q.id);
              return (
                <div key={q.id} className="tt-q">
                  <h3>{i + 1}. {q.prompt}</h3>
                  {q.options.map((o, oi) => <div key={oi} className={`tt-opt ${r?.answer.includes(oi) ? "right" : (answers[q.id] ?? []).includes(oi) ? "wrong" : ""}`}>{o}</div>)}
                  {r?.explanation && <div className="tt-note info">{r.explanation}</div>}
                </div>
              );
            })}
          </div>
        )}
        <div className="tt-bar">{back}{result.kind === "CHECK" && !result.passed && <button type="button" className="quiet-button" onClick={() => { setResult(null); setQuiz(null); }}>Try again</button>}</div>
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="tt" style={{ maxWidth: 720 }}>
        {back}
        <div className="tt-card">
          <header><h2>{title}{chapterTitle ? ` · ${chapterTitle}` : ""}</h2></header>
          <div className="tt-body">
            <div className="tt-sub">{info?.course.title}</div>
            {kind === "FINAL" && info && <>
              <p style={{ margin: 0 }}>Up to 25 questions from the whole course. Pass mark <strong>{info.course.passMark}%</strong>.</p>
              <div className="tt-note">This attempt counts as soon as you press Start, even if you leave before handing it in. You have <strong>{info.enrolment?.attemptsLeft ?? 0}</strong> attempt{info.enrolment?.attemptsLeft === 1 ? "" : "s"} left. The start time, hand-in time and score are recorded.</div>
            </>}
            {kind === "PRE" && <p style={{ margin: 0 }}>Ten questions to see what you already know. There is no pass mark and it does not count.</p>}
            {kind === "CHECK" && <p style={{ margin: 0 }}>A few questions on this chapter. You can take it as often as you like; it helps you get ready for the final quiz.</p>}
            {error && <div className="inline-error">{error}</div>}
            <div><button type="button" className="gold-button" disabled={busy || !info} onClick={() => void start()}>{busy ? <Loader2 className="spin" size={14} /> : null} Start</button></div>
          </div>
        </div>
      </div>
    );
  }

  const q = quiz.questions[index];
  const answered = quiz.questions.filter((x) => (answers[x.id] ?? []).length > 0).length;
  const lastQ = index === quiz.questions.length - 1;
  return (
    <div className="tt" style={{ maxWidth: 820 }}>
      <div className="tt-bar"><strong>{title}</strong>{kind === "FINAL" && <span className="tt-sub">Attempt {quiz.attemptNo}</span>}<span className="tt-grow" /><span className="tt-mono">{index + 1} / {quiz.questions.length} · {answered} answered</span></div>
      <div className="tt-meter"><i style={{ width: `${Math.round((100 * (index + 1)) / quiz.questions.length)}%` }} /></div>
      <div className="tt-q">
        <h3>{q.prompt}</h3>
        {q.multi && <span className="tt-sub">Pick every right answer.</span>}
        {q.options.map((o, oi) => {
          const picked = (answers[q.id] ?? []).includes(oi);
          return <label key={oi} className={`tt-opt ${picked ? "picked" : ""}`}><input type={q.multi ? "checkbox" : "radio"} name={q.id} checked={picked} onChange={() => pick(q.id, oi, q.multi)} />{o}</label>;
        })}
      </div>
      {error && <div className="inline-error">{error}</div>}
      <div className="tt-pager">
        <button type="button" className="quiet-button" disabled={index === 0} onClick={() => setIndex(index - 1)}>← Back</button>
        {!lastQ ? <button type="button" className="gold-button" onClick={() => setIndex(index + 1)}>Next →</button>
          : <button type="button" className="gold-button" disabled={busy} onClick={() => void submit()}>{busy ? <Loader2 className="spin" size={14} /> : null} Hand in{answered < quiz.questions.length ? ` (${quiz.questions.length - answered} unanswered)` : ""}</button>}
      </div>
    </div>
  );
}
