"use client";

import "./tt.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, FileText, Loader2, MessageCircleQuestion, PlayCircle, ShieldAlert, Wrench } from "lucide-react";
import { assetUrl, errText, fmtDate, tt } from "./api";
import { Markdown } from "./Markdown";

type Data = {
  course: { id: string; title: string; archived: boolean };
  lesson: { key: string; title: string; chapterKey: string; chapterTitle: string; topic: string; format: string; objective: string; pages: string[]; pageImages: string[]; pdfAssetId: string | null; videoUrl: string | null; safetyPoint: string; practicalTask: string; minutes: number };
  outline: Array<{ key: string; title: string; done: boolean }>;
  prev: string | null; next: string | null; nextIsNewChapter: boolean; position: { index: number; total: number };
  progress: { pagesSeen: number; done: boolean; safetyConfirmed: boolean } | null; tracking: boolean;
  signoff: { at: string | null; by: string; jobRef: string; comment: string } | null;
  mentor: Array<{ id: string; question: string; answer: string | null; answeredBy: string | null; answeredAt: string | null; mine: boolean; askedAt: string | null }>;
  preview: boolean;
};

const HEARTBEAT_MS = 30_000;

// Lesson reader (2026-11-28): one page at a time like a service manual, with the page's diagram (if any), the safety point to
// confirm, practical task, and questions to a mentor. Active time is sent every 30 s while the page is visible.
export function LessonReader({ courseId, lessonKey }: { courseId: string; lessonKey: string }) {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [safety, setSafety] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const lastBeat = useRef(Date.now());

  useEffect(() => {
    let alive = true;
    tt<Data>(`learn/courses/${courseId}/lessons/${encodeURIComponent(lessonKey)}`).then((d) => {
      if (!alive) return;
      setData(d);
      setSafety(!!d.progress?.safetyConfirmed);
      setPage(d.progress && !d.progress.done ? Math.min(Math.max(0, d.progress.pagesSeen - 1), d.lesson.pages.length - 1) : 0);
      lastBeat.current = Date.now();
    }).catch((e) => setError(errText(e, "Unable to open the lesson.")));
    return () => { alive = false; };
  }, [courseId, lessonKey]);

  const beat = useCallback((p: number) => {
    if (!data?.tracking) return;
    const seconds = Math.round((Date.now() - lastBeat.current) / 1000);
    lastBeat.current = Date.now();
    void tt(`learn/courses/${courseId}/lessons/${encodeURIComponent(lessonKey)}/page`, { method: "POST", body: { page: p, seconds: document.visibilityState === "visible" ? seconds : 0 } }).catch(() => {});
  }, [data?.tracking, courseId, lessonKey]);

  useEffect(() => {
    if (!data?.tracking) return;
    const timer = setInterval(() => { if (document.visibilityState === "visible") beat(page); else lastBeat.current = Date.now(); }, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [data?.tracking, page, beat]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement)?.tagName === "TEXTAREA" || (e.target as HTMLElement)?.tagName === "INPUT" || !data) return;
      if (e.key === "ArrowRight" && page < data.lesson.pages.length - 1) go(page + 1);
      if (e.key === "ArrowLeft" && page > 0) go(page - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function go(p: number) { beat(p); setPage(p); window.scrollTo({ top: 0 }); }

  async function complete() {
    if (!data) return;
    if (!data.tracking) { if (data.next) router.push(`/tech-training/lesson/${courseId}/${encodeURIComponent(data.next)}`); else router.push(`/tech-training/course/${courseId}`); return; }
    setBusy(true); setError("");
    try {
      beat(page);
      const r = await tt<{ allDone: boolean }>(`learn/courses/${courseId}/lessons/${encodeURIComponent(lessonKey)}/complete`, { method: "POST", body: { safetyConfirmed: safety } });
      if (data.nextIsNewChapter || r.allDone || !data.next) router.push(`/tech-training/course/${courseId}`);
      else router.push(`/tech-training/lesson/${courseId}/${encodeURIComponent(data.next)}`);
    } catch (e) { setError(errText(e, "Unable to save.")); setBusy(false); }
  }

  async function ask() {
    setBusy(true); setError("");
    try { await tt(`learn/courses/${courseId}/lessons/${encodeURIComponent(lessonKey)}/ask`, { method: "POST", body: { question } }); setAsked(question); setQuestion(""); }
    catch (e) { setError(errText(e, "Unable to send the question.")); }
    finally { setBusy(false); }
  }

  if (error && !data) return <div className="inline-error">{error}</div>;
  if (!data) return <div className="table-state"><Loader2 className="spin" size={20} /> Opening lesson…</div>;
  const { lesson } = data;
  const last = page >= lesson.pages.length - 1;
  const image = lesson.pageImages[page];
  const seen = Math.max(data.progress?.pagesSeen ?? 0, page + 1);
  return (
    <div className="tt">
      <div className="tt-sub"><Link className="tt-link" href="/tech-training">Courses</Link> / <Link className="tt-link" href={`/tech-training/course/${courseId}`}>{data.course.title}</Link> / {lesson.chapterTitle}</div>
      {data.preview && <div className="tt-note info">Preview: progress is not recorded for your login.</div>}
      <div className="tt-reader">
        <aside className="tt-toc">
          <p className="eyebrow" style={{ margin: "2px 8px 6px" }}>{lesson.chapterTitle}</p>
          {data.outline.map((o) => <Link key={o.key} href={`/tech-training/lesson/${courseId}/${encodeURIComponent(o.key)}`} aria-current={o.key === lesson.key}><span>{o.done ? "✓" : "○"}</span><span>{o.title}</span></Link>)}
        </aside>
        <article className="tt-sheet">
          <p className="eyebrow" style={{ margin: 0 }}>Lesson {data.position.index} of {data.position.total}{lesson.topic ? ` · ${lesson.topic}` : ""} · {lesson.minutes} min</p>
          <h1>{lesson.title}</h1>
          {lesson.objective && page === 0 && <div className="tt-objective">{lesson.objective}</div>}
          {lesson.format === "PDF" && lesson.pdfAssetId && page === 0 && (
            <div className="tt-note info" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}><FileText size={16} /><span className="tt-grow">This lesson is a document. Open it, read it through, then come back to finish the lesson.</span><a className="gold-button" href={assetUrl(lesson.pdfAssetId)} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Open the document</a></div>
          )}
          {lesson.format === "VIDEO" && lesson.videoUrl && page === 0 && (
            <div className="tt-note info" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}><PlayCircle size={16} /><span className="tt-grow">Watch the video, then read the notes below.</span><a className="gold-button" href={lesson.videoUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Watch the video</a></div>
          )}
          {image && (
            // eslint-disable-next-line @next/next/no-img-element -- a stored lesson diagram, served by our own API
            <figure className="tt-fig"><img src={assetUrl(image)} alt={`Diagram for page ${page + 1}`} onClick={() => setZoom(assetUrl(image))} /></figure>
          )}
          <div aria-live="polite"><Markdown text={lesson.pages[page] ?? ""} /></div>
          {lesson.pages.length > 1 && <div className="tt-dots">{lesson.pages.map((_, i) => <button key={i} type="button" aria-label={`Page ${i + 1}`} aria-current={i === page} className={i < seen ? "seen" : ""} onClick={() => go(i)} />)}</div>}
          {last && lesson.safetyPoint && (
            <div className="tt-safety" style={{ marginTop: 16 }}>
              <strong><ShieldAlert size={14} /> Safety point</strong>
              <p style={{ margin: "4px 0 8px", whiteSpace: "pre-line" }}>{lesson.safetyPoint}</p>
              <label style={{ display: "flex", gap: 8, fontWeight: 700 }}><input type="checkbox" checked={safety} onChange={(e) => setSafety(e.target.checked)} disabled={!data.tracking} /> I have read and understood this safety point.</label>
            </div>
          )}
          {last && lesson.practicalTask && (
            <div className="tt-note info" style={{ marginTop: 12 }}>
              <strong><Wrench size={14} /> Practical task</strong>
              <p style={{ margin: "4px 0", whiteSpace: "pre-line" }}>{lesson.practicalTask}</p>
              {data.signoff ? <span className="tt-pill ok">Signed off by {data.signoff.by} on {fmtDate(data.signoff.at)}{data.signoff.jobRef ? ` · job ${data.signoff.jobRef}` : ""}</span> : <span className="tt-sub">Do this on a real job. Your manager or foreman signs it off in Flo X (Approvals).</span>}
            </div>
          )}
          {error && <div className="inline-error" style={{ marginTop: 12 }}>{error}</div>}
          <div className="tt-pager">
            <button type="button" className="quiet-button" disabled={page === 0 && !data.prev} onClick={() => (page > 0 ? go(page - 1) : router.push(`/tech-training/lesson/${courseId}/${encodeURIComponent(data.prev!)}`))}>← Back</button>
            <span className="tt-mono">Page {page + 1} of {lesson.pages.length}</span>
            {!last ? <button type="button" className="gold-button" onClick={() => go(page + 1)}>Next →</button>
              : <button type="button" className="gold-button" disabled={busy || (!!lesson.safetyPoint && data.tracking && !safety)} onClick={() => void complete()}>{busy ? <Loader2 className="spin" size={14} /> : null}{data.progress?.done ? (data.next ? "Next lesson →" : "Back to course") : "Complete lesson ✓"}</button>}
          </div>
        </article>
      </div>

      <section className="tt-card" style={{ maxWidth: 900 }}>
        <header><h3><MessageCircleQuestion size={15} /> Questions on this lesson</h3><span className="tt-sub">Answers stay here for the next person</span></header>
        <div className="tt-body">
          {data.mentor.length === 0 && !asked && <span className="tt-sub">No questions yet.</span>}
          {asked && <div className="tt-note info">Sent: “{asked}”. You will get a notification when it is answered.</div>}
          {data.mentor.map((m) => (
            <div key={m.id} style={{ borderBottom: "1px solid #edeff2", paddingBottom: 8 }}>
              <div style={{ fontWeight: 650 }}>{m.question}{m.mine && <span className="tt-sub"> · you asked</span>}</div>
              {m.answer ? <div style={{ fontSize: 13.5, marginTop: 4, whiteSpace: "pre-line" }}>{m.answer} <span className="tt-sub">— {m.answeredBy}, {fmtDate(m.answeredAt)}</span></div> : <span className="tt-sub">Waiting for an answer</span>}
            </div>
          ))}
          {data.tracking && (
            <div className="tt-bar" style={{ alignItems: "stretch" }}>
              <label className="tt-field tt-grow"><span className="sr-only" style={{ position: "absolute", left: -9999 }}>Your question</span><textarea rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask your mentor about this lesson…" /></label>
              <button type="button" className="quiet-button" disabled={busy || question.trim().length < 5} onClick={() => void ask()}>Ask</button>
            </div>
          )}
        </div>
      </section>
      {zoom && (
        // eslint-disable-next-line @next/next/no-img-element -- enlarged copy of the same lesson diagram
        <div className="tt-lightbox" role="presentation" onClick={() => setZoom(null)}><img src={zoom} alt="Enlarged diagram" /></div>
      )}
    </div>
  );
}
