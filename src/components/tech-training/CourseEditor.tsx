"use client";

import "./tt.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, FileText, ImagePlus, Loader2, Plus, Save, Send, Trash2, Undo2, Upload, X } from "lucide-react";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { chaptersOf, diffLessons, estimateMinutes, LESSON_FORMATS, newKey, splitIntoPages, wordCount, wordDiff, type DraftLesson, type DraftQuestion, type LessonFormat } from "@/lib/training/model";
import { assetUrl, errText, fmtDate, fmtDateTime, readFileAsDataUrl, STATUS_LABEL, statusTone, tt } from "./api";
import { Markdown } from "./Markdown";

type Editor = {
  course: { id: string; code: string; title: string; group: string; status: string; completionMode: string; passMark: number; maxAttempts: number; ownerUserId: string | null; owner: string; reviewMonths: number; nextReviewAt: string | null; docNumber: string; hasCover: boolean; importKey: string | null; archivedAt: string | null; archiveReason: string | null; archivedBy: string };
  live: { id: string; label: string; publishedAt: string | null; lessons: DraftLesson[]; questions: DraftQuestion[] } | null;
  draft: { id: string; status: string; reviewComment: string | null; changeLevel: string | null; whatChanged: string; submittedBy: string; submittedAt: string | null; updatedAt: string | null; lessons: DraftLesson[]; questions: DraftQuestion[] } | null;
  diff: { changes: Record<string, string>; removed: Array<{ stableKey: string; title: string }>; counts: { changed: number; added: number; removed: number }; questionsChanged: boolean } | null;
  history: Array<{ id: string; label: string; status: string; changeLevel: string | null; whatChanged: string; publishedAt: string | null; publishedBy: string; author: string }>;
  assets: Array<{ id: string; name: string; mime: string }>;
  owners: Array<{ userId: string; name: string }>;
  impact: { inProgress: number; certified: number; positions: Array<{ id: string; name: string }> };
  canPublish: boolean;
};

const SNIPPETS: Array<{ label: string; insert: string; block?: boolean }> = [
  { label: "H2", insert: "## Heading", block: true },
  { label: "H3", insert: "### Sub-heading", block: true },
  { label: "B", insert: "**bold**" },
  { label: "• List", insert: "- First point\n- Second point", block: true },
  { label: "1. List", insert: "1. First step\n2. Second step", block: true },
  { label: "Table", insert: "| Item | Value |\n| --- | --- |\n| | |", block: true },
  { label: "Safety point", insert: "> Safety: ", block: true },
  { label: "Note", insert: "> Note: ", block: true },
];

const blankLesson = (chapterKey: string, chapterTitle: string): DraftLesson => ({ stableKey: newKey("l"), chapterKey, chapterTitle, topicTitle: "", title: "New lesson", format: "TEXT", objective: "", pages: [""], pageImages: [""], pdfAssetId: null, videoUrl: null, safetyPoint: "", practicalTask: "", estMinutes: 2 });
const blankQuestion = (scope: "FINAL" | "CHECK", chapterKey = ""): DraftQuestion => ({ stableKey: newKey("q"), scope, chapterKey, lessonKey: "", prompt: "", options: ["", "", "", ""], answer: [0], explanation: "" });

// Course editor (2026-11-28): text-first lesson editor, quiz builder, settings and revision history for one course.
export function CourseEditor({ courseId }: { courseId: string }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirmDialog();
  const [data, setData] = useState<Editor | null>(null);
  const [lessons, setLessons] = useState<DraftLesson[]>([]);
  const [questions, setQuestions] = useState<DraftQuestion[]>([]);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [tab, setTab] = useState<"content" | "quiz" | "settings" | "history">("content");
  const [sel, setSel] = useState<string | null>(null);
  const [pageSel, setPageSel] = useState<{ key: string | null; n: number }>({ key: null, n: 0 });
  const [mode, setMode] = useState<"write" | "preview" | "compare">("write");
  const [drag, setDrag] = useState<string | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [publish, setPublish] = useState<{ kind: "submit" | "publish" | "return"; level: "MINOR" | "MAJOR"; whatChanged: string; askHolders: boolean; comment: string } | null>(null);
  const [settings, setSettings] = useState<Editor["course"] | null>(null);
  const [editQ, setEditQ] = useState<DraftQuestion | null>(null);
  const [coverVersion, setCoverVersion] = useState(0);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const saving = useRef(false);

  const load = useCallback(async (keepSel = true) => {
    try {
      const d = await tt<Editor>(`manage/courses/${courseId}`);
      setData(d); setSettings(d.course);
      const content = d.draft ?? d.live;
      setLessons(content?.lessons ?? []); setQuestions(content?.questions ?? []); setDirty(false);
      setSel((s) => (keepSel && s && content?.lessons.some((l) => l.stableKey === s) ? s : content?.lessons[0]?.stableKey ?? null));
    } catch (e) { setError(errText(e, "Unable to load the course.")); }
  }, [courseId]);
  useEffect(() => { const t = setTimeout(() => void load(false), 0); return () => clearTimeout(t); }, [load]);

  const editable = !!data?.draft && data.course.status !== "ARCHIVED" && data.canPublish;
  const lesson = lessons.find((l) => l.stableKey === sel) ?? null;
  const liveLesson = data?.live?.lessons.find((l) => l.stableKey === sel) ?? null;
  const chapters = useMemo(() => chaptersOf(lessons), [lessons]);
  const diff = useMemo(() => (data?.live && data.draft ? diffLessons(data.live.lessons, lessons) : null), [data, lessons]);
  const finalCount = questions.filter((q) => q.scope === "FINAL").length;

  // The page shown belongs to the selected lesson: picking another lesson starts at its page 1.
  const page = pageSel.key === sel ? pageSel.n : 0;
  const setPage = (n: number) => setPageSel({ key: sel, n });

  async function save(quiet = false) {
    if (!editable || saving.current) return;
    saving.current = true;
    if (!quiet) setBusy(true);
    try {
      const r = await tt<{ savedAt: string }>(`manage/courses/${courseId}/draft`, { method: "PUT", body: { lessons, questions } });
      setDirty(false); setSavedAt(r.savedAt); setError("");
      if (data?.draft?.status === "IN_REVIEW") await load();
    } catch (e) { setError(errText(e, "Unable to save the draft.")); }
    finally { saving.current = false; if (!quiet) setBusy(false); }
  }
  const saveRef = useRef(save);
  useEffect(() => { saveRef.current = save; });
  // Autosave a few seconds after the last change.
  useEffect(() => { if (!dirty) return; const t = setTimeout(() => void saveRef.current(true), 4000); return () => clearTimeout(t); }, [dirty, lessons, questions]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function patchLesson(key: string, patch: Partial<DraftLesson>) {
    setLessons((ls) => ls.map((l) => (l.stableKey === key ? { ...l, ...patch, estMinutes: patch.pages ? estimateMinutes(patch.pages) : l.estMinutes } : l)));
    setDirty(true);
  }
  function setPageText(text: string) {
    if (!lesson) return;
    const pages = [...lesson.pages]; pages[page] = text;
    patchLesson(lesson.stableKey, { pages });
  }
  function insertSnippet(s: (typeof SNIPPETS)[number]) {
    if (!lesson) return;
    const ta = textRef.current;
    const text = lesson.pages[page] ?? "";
    const start = ta?.selectionStart ?? text.length;
    const end = ta?.selectionEnd ?? text.length;
    const selected = text.slice(start, end);
    let ins = s.label === "B" && selected ? `**${selected}**` : s.insert;
    if (s.block) ins = `${start > 0 && !text.slice(0, start).endsWith("\n\n") ? (text.slice(0, start).endsWith("\n") ? "\n" : "\n\n") : ""}${ins}\n\n`;
    setPageText(text.slice(0, start) + ins + text.slice(end));
    setTimeout(() => { ta?.focus(); const pos = start + ins.length; ta?.setSelectionRange(pos, pos); }, 0);
  }
  function addPage(after = page) {
    if (!lesson) return;
    const pages = [...lesson.pages]; const imgs = [...lesson.pageImages];
    pages.splice(after + 1, 0, ""); imgs.splice(after + 1, 0, "");
    patchLesson(lesson.stableKey, { pages, pageImages: imgs }); setPage(after + 1);
  }
  function removePage() {
    if (!lesson || lesson.pages.length <= 1) return;
    const pages = lesson.pages.filter((_, i) => i !== page); const imgs = lesson.pageImages.filter((_, i) => i !== page);
    patchLesson(lesson.stableKey, { pages, pageImages: imgs }); setPage(Math.max(0, page - 1));
  }
  function splitPages() {
    if (!lesson) return;
    const pages = splitIntoPages(lesson.pages.join("\n\n"));
    patchLesson(lesson.stableKey, { pages, pageImages: pages.map((_, i) => lesson.pageImages[i] ?? "") }); setPage(0);
  }
  function addLesson(chapterKey: string, chapterTitle: string) {
    if (!editable) return;
    const l = blankLesson(chapterKey, chapterTitle);
    const lastIdx = lessons.map((x) => x.chapterKey).lastIndexOf(chapterKey);
    setLessons((ls) => { const copy = [...ls]; copy.splice(lastIdx < 0 ? copy.length : lastIdx + 1, 0, l); return copy; });
    setSel(l.stableKey); setDirty(true);
  }
  function addChapter() {
    if (!editable) return;
    const key = newKey("ch");
    const l = blankLesson(key, `Chapter ${chapters.length + 1}`);
    setLessons((ls) => [...ls, l]); setSel(l.stableKey); setDirty(true);
  }
  function renameChapter(key: string, title: string) { setLessons((ls) => ls.map((l) => (l.chapterKey === key ? { ...l, chapterTitle: title } : l))); setDirty(true); }
  async function removeLesson(key: string) {
    const l = lessons.find((x) => x.stableKey === key);
    if (!l || !(await confirm({ title: "Remove lesson?", message: `Remove "${l.title}" from the draft? The published revision keeps it until this draft is published.`, tone: "warning", confirmLabel: "Remove" }))) return;
    setLessons((ls) => ls.filter((x) => x.stableKey !== key));
    setQuestions((qs) => qs.map((q) => (q.lessonKey === key ? { ...q, lessonKey: "" } : q)));
    setSel((s) => (s === key ? lessons.find((x) => x.stableKey !== key)?.stableKey ?? null : s)); setDirty(true);
  }
  function dropLesson(targetKey: string) {
    if (!drag || drag === targetKey) return;
    setLessons((ls) => {
      const moving = ls.find((l) => l.stableKey === drag)!; const target = ls.find((l) => l.stableKey === targetKey)!;
      const rest = ls.filter((l) => l.stableKey !== drag);
      const idx = rest.findIndex((l) => l.stableKey === targetKey);
      rest.splice(idx, 0, { ...moving, chapterKey: target.chapterKey, chapterTitle: target.chapterTitle });
      return rest;
    });
    setDirty(true); setDrag(null); setDropOn(null);
  }

  async function uploadAsset(file: File | undefined, kind: "image" | "pdf") {
    if (!file || !lesson) return;
    if (kind === "image" && !/^image\/(png|jpeg|gif|webp)$/.test(file.type)) { setError("Images must be PNG, JPEG, GIF or WebP."); return; }
    if (kind === "pdf" && file.type !== "application/pdf") { setError("Choose a PDF file."); return; }
    setBusy(true); setError("");
    try {
      const r = await tt<{ id: string }>(`manage/courses/${courseId}/assets`, { method: "POST", body: { name: file.name, dataUrl: await readFileAsDataUrl(file) } });
      if (kind === "image") { const imgs = lesson.pages.map((_, i) => lesson.pageImages[i] ?? ""); imgs[page] = r.id; patchLesson(lesson.stableKey, { pageImages: imgs, format: lesson.format === "TEXT" ? "TEXT_IMAGES" : lesson.format }); }
      else patchLesson(lesson.stableKey, { pdfAssetId: r.id, format: "PDF" });
    } catch (e) { setError(errText(e, "Upload failed.")); }
    finally { setBusy(false); }
  }

  async function action(fn: () => Promise<unknown>, ok: string, reload = true) {
    setBusy(true); setError(""); setNotice("");
    try { if (dirty && editable) await save(true); await fn(); setNotice(ok); if (reload) await load(); }
    catch (e) { setError(errText(e, "That did not work.")); }
    finally { setBusy(false); }
  }

  async function startDraft() { await action(() => tt(`manage/courses/${courseId}/draft`, { method: "POST" }), "Draft started. Learners keep the published version until you publish."); }
  async function discard() {
    if (!(await confirm({ title: "Discard the draft?", message: "Every change in this draft is lost. The published revision stays as it is.", tone: "danger", confirmLabel: "Discard" }))) return;
    await action(() => tt(`manage/courses/${courseId}/draft`, { method: "DELETE" }), "Draft discarded.");
  }
  async function deleteCourse() {
    if (!(await confirm({ title: "Delete course?", message: "This course was never published, so it can be deleted. This cannot be undone.", tone: "danger", confirmLabel: "Delete" }))) return;
    setBusy(true);
    try { await tt(`manage/courses/${courseId}`, { method: "DELETE" }); router.push("/tech-training/manage"); } catch (e) { setError(errText(e, "Unable to delete.")); setBusy(false); }
  }
  async function doPublish() {
    if (!publish) return;
    const p = publish;
    if (p.kind === "submit") await action(() => tt(`manage/courses/${courseId}/submit`, { method: "POST", body: { changeLevel: p.level, whatChanged: p.whatChanged } }), "Sent for review.");
    else if (p.kind === "return") await action(() => tt(`manage/courses/${courseId}/return`, { method: "POST", body: { comment: p.comment } }), "Sent back to the author.");
    else await action(async () => { const r = await tt<{ revision: string }>(`manage/courses/${courseId}/publish`, { method: "POST", body: { changeLevel: p.level, whatChanged: p.whatChanged, askHoldersToUpdate: p.askHolders } }); setNotice(`Published as ${r.revision}.`); }, "Published.");
    setPublish(null);
  }
  async function rollback(revisionId: string, label: string) {
    if (!(await confirm({ title: `Roll back to ${label}?`, message: `${label} is published again as a new revision. Nothing is deleted; the current revision stays in the history.`, tone: "warning", confirmLabel: "Roll back" }))) return;
    await action(() => tt(`manage/courses/${courseId}/rollback`, { method: "POST", body: { revisionId } }), `Rolled back to ${label}.`);
  }
  async function saveSettings() {
    if (!settings) return;
    await action(() => tt(`manage/courses/${courseId}/settings`, { method: "PUT", body: { title: settings.title, group: settings.group, docNumber: settings.docNumber, ownerUserId: settings.ownerUserId, reviewMonths: settings.reviewMonths, completionMode: settings.completionMode, passMark: settings.passMark, maxAttempts: settings.maxAttempts, code: settings.code } }), "Settings saved.");
  }
  async function uploadCover(file: File | undefined) {
    if (!file) return;
    await action(async () => { await tt(`manage/courses/${courseId}/cover`, { method: "PUT", body: { dataUrl: await readFileAsDataUrl(file) } }); setCoverVersion((v) => v + 1); }, "Cover saved.");
  }
  async function uploadPack(file: File | undefined) {
    if (!file) return;
    await action(async () => { const r = await tt<{ placed: number }>(`manage/courses/${courseId}/images`, { method: "POST", body: { images: JSON.parse(await file.text()) } }); setNotice(`${r.placed} diagrams placed on their pages.`); }, "Diagrams added.");
  }
  async function uploadQuiz(file: File | undefined) {
    if (!file) return;
    await action(async () => {
      const parsed = JSON.parse(await file.text()) as { questions?: unknown };
      const r = await tt<{ added: number }>(`manage/courses/${courseId}/quiz`, { method: "POST", body: { questions: parsed.questions ?? parsed } });
      setNotice(`${r.added} quiz questions added.`);
    }, "Quiz added.");
  }


  function saveQuestion() {
    if (!editQ) return;
    const clean = { ...editQ, options: editQ.options.map((o) => o.trim()).filter(Boolean) };
    if (clean.prompt.trim().length < 5) { setError("Type the question."); return; }
    if (clean.options.length < 2) { setError("Give at least two answers."); return; }
    clean.answer = clean.answer.filter((a) => a < clean.options.length);
    if (!clean.answer.length) { setError("Tick the right answer."); return; }
    setQuestions((qs) => (qs.some((q) => q.stableKey === clean.stableKey) ? qs.map((q) => (q.stableKey === clean.stableKey ? clean : q)) : [...qs, clean]));
    setEditQ(null); setDirty(true); setError("");
  }

  if (error && !data) return <div className="inline-error">{error}</div>;
  if (!data || !settings) return <div className="table-state"><Loader2 className="spin" size={20} /> Loading course…</div>;
  const c = data.course;
  const tag = (key: string) => (diff ? diff.changes[key] : undefined);
  const neverPublished = !data.live;
  return (
    <div className="tt">
      <div className="tt-sub"><Link className="tt-link" href="/tech-training/manage">Course manager</Link> / {c.title}</div>
      <header className="page-header compact">
        <div>
          <p className="eyebrow">Course manager · {c.code} · {c.docNumber}</p>
          <h1>{c.title} <span className={`tt-pill ${statusTone(c.status)}`} style={{ verticalAlign: "middle" }}>{STATUS_LABEL[c.status]}</span>{data.live && <span className="tt-pill" style={{ verticalAlign: "middle", marginLeft: 6 }}>Live {data.live.label}</span>}{data.draft && <span className={`tt-pill ${statusTone(data.draft.status)}`} style={{ verticalAlign: "middle", marginLeft: 6 }}>{data.draft.status === "IN_REVIEW" ? "Draft in review" : "Draft"}</span>}</h1>
          <p>{data.draft ? (data.live ? "Learners keep seeing the published revision until this draft is published." : "Not published yet: nobody can see this course.") : c.status === "ARCHIVED" ? `Archived ${fmtDate(c.archivedAt)} by ${c.archivedBy}: ${c.archiveReason ?? ""}` : "Published. Click Edit draft to change it."}{editable && <span className={`tt-sub`} style={{ marginLeft: 8 }}>{dirty ? "Unsaved changes" : savedAt ? `Saved ${fmtDateTime(savedAt)}` : ""}</span>}</p>
        </div>
        <div className="tt-bar">
          {data.live && <Link className="quiet-button" href={`/tech-training/course/${c.id}`}><Eye size={14} /> Preview as learner</Link>}
          {!data.draft && c.status !== "ARCHIVED" && data.canPublish && <button type="button" className="gold-button" disabled={busy} onClick={() => void startDraft()}>Edit draft</button>}
          {editable && <button type="button" className="quiet-button" disabled={busy || !dirty} onClick={() => void save()}><Save size={14} /> Save</button>}
          {editable && data.draft?.status === "DRAFT" && <button type="button" className="quiet-button" disabled={busy} onClick={() => setPublish({ kind: "submit", level: (data.draft?.changeLevel as "MINOR" | "MAJOR") ?? "MINOR", whatChanged: data.draft?.whatChanged ?? "", askHolders: false, comment: "" })}><Send size={14} /> Submit for review</button>}
          {editable && data.draft?.status === "IN_REVIEW" && <button type="button" className="quiet-button" disabled={busy} onClick={() => setPublish({ kind: "return", level: "MINOR", whatChanged: "", askHolders: false, comment: "" })}><Undo2 size={14} /> Send back</button>}
          {editable && <button type="button" className="gold-button" disabled={busy} onClick={() => setPublish({ kind: "publish", level: (data.draft?.changeLevel as "MINOR" | "MAJOR") ?? (diff && (diff.counts.added || diff.counts.removed) ? "MAJOR" : "MINOR"), whatChanged: data.draft?.whatChanged ?? "", askHolders: false, comment: "" })}>Publish</button>}
          {editable && data.live && <button type="button" className="quiet-button" disabled={busy} onClick={() => void discard()}><Trash2 size={14} /> Discard draft</button>}
          {neverPublished && data.canPublish && <button type="button" className="danger-button" disabled={busy} onClick={() => void deleteCourse()}><Trash2 size={14} /> Delete course</button>}
        </div>
      </header>
      {data.draft?.reviewComment && <div className="tt-note"><strong>Reviewer comment:</strong> {data.draft.reviewComment}</div>}
      {data.draft?.status === "IN_REVIEW" && <div className="tt-note info">Sent for review by {data.draft.submittedBy} on {fmtDateTime(data.draft.submittedAt)} ({data.draft.changeLevel?.toLowerCase()} change): {data.draft.whatChanged}. Editing takes it back to Draft.</div>}
      {c.completionMode === "QUIZ_CERTIFICATE" && finalCount < 5 && <div className="tt-note">The final quiz has {finalCount} question{finalCount === 1 ? "" : "s"}; at least 5 are needed before publishing (Quiz tab). Or set the course to Read and acknowledge (Settings tab).</div>}
      {error && <div className="inline-error">{error}</div>}
      {notice && <div className="tt-note ok">{notice}</div>}
      <div className="tt-tabs" role="tablist">
        {([["content", `Content · ${lessons.length} lessons`], ["quiz", `Quiz · ${questions.length}`], ["settings", "Settings"], ["history", `History · ${data.history.length}`]] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === "content" && (
        <div className="tt-split three">
          <nav className="tt-card" aria-label="Course outline" style={{ padding: 10 }}>
            <div className="tt-sub" style={{ fontWeight: 700, padding: "2px 6px 6px" }}>OUTLINE{editable ? " · drag to reorder" : ""}</div>
            <div className="tt-outline">
              {chapters.map((ch) => (
                <Fragment key={ch.key}>
                  <div className="ch">{editable ? <input aria-label="Chapter title" value={ch.title} onChange={(e) => renameChapter(ch.key, e.target.value)} /> : <span>{ch.title}</span>}</div>
                  {ch.lessons.map((l) => (
                    <div key={l.stableKey} className={`ls ${sel === l.stableKey ? "sel" : ""} ${drag === l.stableKey ? "dragging" : ""} ${dropOn === l.stableKey ? "dropt" : ""}`} onClick={() => setSel(l.stableKey)} draggable={editable} onDragStart={() => setDrag(l.stableKey)} onDragEnd={() => { setDrag(null); setDropOn(null); }} onDragOver={(e) => { if (drag) { e.preventDefault(); setDropOn(l.stableKey); } }} onDrop={(e) => { e.preventDefault(); dropLesson(l.stableKey); }} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setSel(l.stableKey); }}>
                      {editable && <span className="grip" aria-hidden="true">⋮⋮</span>}
                      <span className="t">{l.title || "Untitled"}</span>
                      {tag(l.stableKey) && tag(l.stableKey) !== "SAME" && <span className={`tt-tag ${tag(l.stableKey)}`}>{tag(l.stableKey) === "NEW" ? "New" : "Changed"}</span>}
                      {l.format === "PDF" && <FileText size={12} />}
                    </div>
                  ))}
                  {editable && <button type="button" className="tt-link" style={{ fontSize: 12, padding: "2px 6px", justifySelf: "start" }} onClick={() => addLesson(ch.key, ch.title)}>+ Lesson</button>}
                </Fragment>
              ))}
              {diff?.removed.map((r) => <div key={r.stableKey} className="ls removed"><span className="t">{r.title}</span><span className="tt-tag REMOVED">Removed</span></div>)}
              {editable && <button type="button" className="quiet-button" style={{ marginTop: 8 }} onClick={addChapter}><Plus size={13} /> Chapter</button>}
              {!lessons.length && <span className="tt-sub">No lessons yet.</span>}
            </div>
          </nav>

          {lesson ? (
            <section className="tt-card">
              <div className="tt-body">
                <div className="tt-grid2">
                  <label className="tt-field">Lesson title<input value={lesson.title} disabled={!editable} onChange={(e) => patchLesson(lesson.stableKey, { title: e.target.value })} style={{ fontWeight: 650, fontSize: 15 }} /></label>
                  <label className="tt-field">Chapter<select value={lesson.chapterKey} disabled={!editable} onChange={(e) => { const ch = chapters.find((x) => x.key === e.target.value)!; patchLesson(lesson.stableKey, { chapterKey: ch.key, chapterTitle: ch.title }); }}>{chapters.map((ch) => <option key={ch.key} value={ch.key}>{ch.title}</option>)}</select></label>
                </div>
                <div className="tt-seg" role="group" aria-label="Lesson type" style={{ justifySelf: "start" }}>
                  {LESSON_FORMATS.map((f) => <button key={f.id} type="button" aria-pressed={lesson.format === f.id} disabled={!editable} onClick={() => patchLesson(lesson.stableKey, { format: f.id as LessonFormat })}>{f.label}</button>)}
                </div>
                {lesson.format === "PDF" && (
                  <div className="tt-note info tt-bar"><FileText size={15} />{lesson.pdfAssetId ? <><span className="tt-grow">{data.assets.find((a) => a.id === lesson.pdfAssetId)?.name ?? "Document attached"}</span><a className="tt-link" href={assetUrl(lesson.pdfAssetId)} target="_blank" rel="noopener noreferrer">Open</a></> : <span className="tt-grow">No PDF attached yet.</span>}{editable && <label className="quiet-button" style={{ cursor: "pointer" }}><Upload size={13} /> {lesson.pdfAssetId ? "Replace" : "Attach"} PDF<input type="file" accept="application/pdf" hidden onChange={(e) => void uploadAsset(e.target.files?.[0], "pdf")} /></label>}</div>
                )}
                {lesson.format === "VIDEO" && <label className="tt-field">Video link<input value={lesson.videoUrl ?? ""} disabled={!editable} placeholder="https://…" onChange={(e) => patchLesson(lesson.stableKey, { videoUrl: e.target.value })} /><span className="hint">Learners open it in a new tab, then read the notes below.</span></label>}
                <label className="tt-field">Objective (shown on page 1)<textarea rows={2} value={lesson.objective} disabled={!editable} onChange={(e) => patchLesson(lesson.stableKey, { objective: e.target.value })} /></label>
                <div className="tt-bar">
                  <div className="tt-pagechips"><span className="tt-sub" style={{ marginRight: 4 }}>Pages</span>{lesson.pages.map((_, i) => <button key={i} type="button" aria-pressed={i === page} onClick={() => setPage(i)}>{i + 1}</button>)}{editable && <button type="button" aria-label="Add page" onClick={() => addPage()}>+</button>}</div>
                  <span className="tt-grow" />
                  <div className="tt-seg" role="group" aria-label="View"><button type="button" aria-pressed={mode === "write"} onClick={() => setMode("write")}>Write</button><button type="button" aria-pressed={mode === "preview"} onClick={() => setMode("preview")}>Preview</button>{liveLesson && data.draft && <button type="button" aria-pressed={mode === "compare"} onClick={() => setMode("compare")}>Compare with live</button>}</div>
                </div>
                {lesson.pageImages[page] && (
                  <div className="tt-fig" style={{ position: "relative" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- a stored lesson image */}
                    <img src={assetUrl(lesson.pageImages[page])} alt="" style={{ maxHeight: 260 }} />
                    {editable && <button type="button" className="tt-x" aria-label="Remove image" style={{ position: "absolute", top: 6, right: 6 }} onClick={() => { const imgs = lesson.pages.map((_, i) => lesson.pageImages[i] ?? ""); imgs[page] = ""; patchLesson(lesson.stableKey, { pageImages: imgs }); }}><X size={14} /></button>}
                  </div>
                )}
                {mode === "write" && <>
                  {editable && <div className="tt-toolbar" role="toolbar" aria-label="Formatting">
                    {SNIPPETS.map((s) => <button key={s.label} type="button" onClick={() => insertSnippet(s)}>{s.label}</button>)}
                    <label style={{ minHeight: 30, padding: "0 9px", border: "1px solid #e2e6ec", background: "#fff", borderRadius: 5, fontSize: 12, fontWeight: 650, display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }}><ImagePlus size={13} /> Image<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => void uploadAsset(e.target.files?.[0], "image")} /></label>
                    <button type="button" onClick={splitPages} title="Re-split all the text into pages of about 350 words">Split into pages</button>
                    {lesson.pages.length > 1 && <button type="button" onClick={removePage}>Delete page</button>}
                  </div>}
                  <textarea ref={textRef} className="tt-page-editor" value={lesson.pages[page] ?? ""} readOnly={!editable} onChange={(e) => setPageText(e.target.value)} placeholder={"Type here, or paste from Word.\n\n## Headings, - lists, 1. steps, | tables |\n> Safety: …   > Note: …"} aria-label={`Page ${page + 1} text`} />
                  <span className="tt-sub">{wordCount(lesson.pages[page] ?? "")} words on this page · {lesson.pages.reduce((n, p) => n + wordCount(p), 0)} in the lesson · about {estimateMinutes(lesson.pages)} min</span>
                </>}
                {mode === "preview" && <div style={{ border: "1px solid #e2e6ec", borderRadius: 8, padding: 18 }}><Markdown text={lesson.pages[page] ?? ""} /></div>}
                {mode === "compare" && liveLesson && (
                  <div style={{ border: "1px solid #e2e6ec", borderRadius: 8, padding: 18 }} className="tt-md">
                    <div className="tt-sub" style={{ marginBottom: 8 }}>Page {page + 1}: <ins>added</ins> and <del>removed</del> since {data.live?.label}</div>
                    <p style={{ whiteSpace: "pre-wrap" }}>{wordDiff(liveLesson.pages[page] ?? "", lesson.pages[page] ?? "").map((run, i) => (run.kind === "add" ? <ins key={i}>{run.text}</ins> : run.kind === "del" ? <del key={i}>{run.text}</del> : <span key={i}>{run.text}</span>))}</p>
                  </div>
                )}
              </div>
            </section>
          ) : <section className="tt-card tt-empty">{editable ? "Add a chapter to start." : "No lessons."}</section>}

          <aside className="tt">
            {lesson && (
              <div className="tt-card"><header><h3>Lesson settings</h3></header><div className="tt-body">
                <div className="tt-sub">Reading time: about {estimateMinutes(lesson.pages)} min · {lesson.pages.length} page{lesson.pages.length === 1 ? "" : "s"}</div>
                <label className="tt-field">Safety point (learner must confirm)<textarea rows={3} value={lesson.safetyPoint} disabled={!editable} onChange={(e) => patchLesson(lesson.stableKey, { safetyPoint: e.target.value })} placeholder="Leave empty if none" /></label>
                <label className="tt-field">Practical task (signed off on a real job)<textarea rows={3} value={lesson.practicalTask} disabled={!editable} onChange={(e) => patchLesson(lesson.stableKey, { practicalTask: e.target.value })} placeholder="e.g. Pressure-test the load-sensing circuit and set the margin pressure" /></label>
                <div className="tt-sub">Knowledge check for this chapter: {questions.filter((q) => q.scope === "CHECK" && q.chapterKey === lesson.chapterKey).length} question(s). Add them on the Quiz tab.</div>
                {editable && <button type="button" className="danger-button" onClick={() => void removeLesson(lesson.stableKey)}><Trash2 size={13} /> Remove lesson</button>}
              </div></div>
            )}
            {diff && (
              <div className="tt-card"><header><h3>Changes in this draft</h3></header><div className="tt-body">
                <span>{diff.counts.changed} lesson{diff.counts.changed === 1 ? "" : "s"} changed · {diff.counts.added} new · {diff.counts.removed} removed</span>
                <span className="tt-sub">Major changes (procedures, specifications, safety, quiz) ask learners part-way through to redo the changed lessons{data.impact.certified ? `, and can ask the ${data.impact.certified} certificate holders to update` : ""}.</span>
              </div></div>
            )}
          </aside>
        </div>
      )}

      {tab === "quiz" && (
        <div className="tt">
          <section className="tt-card">
            <header><h3>Final quiz</h3><span className="tt-sub">{finalCount} question{finalCount === 1 ? "" : "s"} · up to 25 are drawn at random for each attempt · pass mark {c.passMark}% · {c.maxAttempts} attempts</span><span className="tt-grow" />{editable && <button type="button" className="quiet-button" onClick={() => setEditQ(blankQuestion("FINAL"))}><Plus size={13} /> Question</button>}</header>
            <div className="tt-body">
              {questions.filter((q) => q.scope === "FINAL").map((q, i) => <QuestionRow key={q.stableKey} q={q} n={i + 1} lessons={lessons} editable={editable} onEdit={() => setEditQ(q)} onDelete={() => { setQuestions((qs) => qs.filter((x) => x.stableKey !== q.stableKey)); setDirty(true); }} />)}
              {finalCount === 0 && <span className="tt-sub">No questions yet. Each question can point to the lesson to revise when it is answered wrong.</span>}
            </div>
          </section>
          {chapters.map((ch) => {
            const qs = questions.filter((q) => q.scope === "CHECK" && q.chapterKey === ch.key);
            return (
              <section key={ch.key} className="tt-card">
                <header><h3>Knowledge check · {ch.title}</h3><span className="tt-sub">{qs.length} question{qs.length === 1 ? "" : "s"} · optional, shown at the end of the chapter</span><span className="tt-grow" />{editable && <button type="button" className="quiet-button" onClick={() => setEditQ(blankQuestion("CHECK", ch.key))}><Plus size={13} /> Question</button>}</header>
                {qs.length > 0 && <div className="tt-body">{qs.map((q, i) => <QuestionRow key={q.stableKey} q={q} n={i + 1} lessons={lessons} editable={editable} onEdit={() => setEditQ(q)} onDelete={() => { setQuestions((all) => all.filter((x) => x.stableKey !== q.stableKey)); setDirty(true); }} />)}</div>}
              </section>
            );
          })}
        </div>
      )}

      {tab === "settings" && (
        <section className="tt-card" style={{ maxWidth: 900 }}><div className="tt-body">
          <div className="tt-grid2">
            <label className="tt-field">Title<input value={settings.title} onChange={(e) => setSettings({ ...settings, title: e.target.value })} disabled={!data.canPublish} /></label>
            <label className="tt-field">Group<input value={settings.group} onChange={(e) => setSettings({ ...settings, group: e.target.value })} disabled={!data.canPublish} /></label>
            <label className="tt-field">Course code<input className="tt-mono" value={settings.code} onChange={(e) => setSettings({ ...settings, code: e.target.value.toUpperCase() })} disabled={!neverPublished || !data.canPublish} /><span className="hint">{neverPublished ? "Can change until first published" : "Locked: certificates carry it"}</span></label>
            <label className="tt-field">Document number (ISO 7.5)<input className="tt-mono" value={settings.docNumber} onChange={(e) => setSettings({ ...settings, docNumber: e.target.value })} disabled={!data.canPublish} /></label>
            <label className="tt-field">Course owner<select value={settings.ownerUserId ?? ""} onChange={(e) => setSettings({ ...settings, ownerUserId: e.target.value || null })} disabled={!data.canPublish}><option value="">—</option>{data.owners.map((o) => <option key={o.userId} value={o.userId}>{o.name}</option>)}</select><span className="hint">Keeps it up to date; reminded at review time</span></label>
            <label className="tt-field">Review every (months)<input type="number" min={1} max={60} value={settings.reviewMonths} onChange={(e) => setSettings({ ...settings, reviewMonths: Number(e.target.value) })} disabled={!data.canPublish} /><span className="hint">Next review {fmtDate(c.nextReviewAt)}</span></label>
            <label className="tt-field">Completed by<select value={settings.completionMode} onChange={(e) => setSettings({ ...settings, completionMode: e.target.value })} disabled={!data.canPublish}><option value="QUIZ_CERTIFICATE">Quiz, manager approval, certificate</option><option value="ACKNOWLEDGE">Read and acknowledge</option></select></label>
            <div className="tt-grid2">
              <label className="tt-field">Pass mark %<input type="number" min={1} max={100} value={settings.passMark} onChange={(e) => setSettings({ ...settings, passMark: Number(e.target.value) })} disabled={!data.canPublish || settings.completionMode !== "QUIZ_CERTIFICATE"} /></label>
              <label className="tt-field">Attempts<input type="number" min={1} max={20} value={settings.maxAttempts} onChange={(e) => setSettings({ ...settings, maxAttempts: Number(e.target.value) })} disabled={!data.canPublish || settings.completionMode !== "QUIZ_CERTIFICATE"} /></label>
            </div>
          </div>
          {data.canPublish && <div><button type="button" className="gold-button" disabled={busy} onClick={() => void saveSettings()}>Save settings</button></div>}
          <hr style={{ border: 0, borderTop: "1px solid #edeff2", width: "100%" }} />
          <div className="tt-bar">
            {/* eslint-disable-next-line @next/next/no-img-element -- the course cover */}
            {c.hasCover && <img src={`/api/v1/tech-training/covers/${c.id}?v=${coverVersion}`} alt="" style={{ height: 70, borderRadius: 6 }} />}
            {data.canPublish && <label className="quiet-button" style={{ cursor: "pointer" }}><ImagePlus size={13} /> {c.hasCover ? "Change" : "Add"} cover image<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void uploadCover(e.target.files?.[0])} /></label>}
            {c.importKey && data.canPublish && <label className="quiet-button" style={{ cursor: "pointer" }}><Upload size={13} /> Add diagrams (image pack .json)<input type="file" accept=".json,application/json" hidden onChange={(e) => void uploadPack(e.target.files?.[0])} /></label>}
            {data.canPublish && <label className="quiet-button" style={{ cursor: "pointer" }} title="Only for a course with no final quiz yet; otherwise change the quiz in a new revision"><Upload size={13} /> Add final quiz (quiz pack .json)<input type="file" accept=".json,application/json" hidden onChange={(e) => void uploadQuiz(e.target.files?.[0])} /></label>}
          </div>
          {data.impact.positions.length > 0 && <span className="tt-sub">Required for: {data.impact.positions.map((p) => p.name).join(", ")} (change under Training settings &gt; Positions).</span>}
        </div></section>
      )}

      {tab === "history" && (
        <section className="master-panel"><div className="data-table-wrap"><table className="data-table">
          <thead><tr><th>Revision</th><th>What changed</th><th>Level</th><th>Published</th><th>By</th><th></th></tr></thead>
          <tbody>
            {data.history.map((h) => <tr key={h.id}><td className="tt-mono">{h.label}{h.status === "PUBLISHED" && <span className="tt-pill ok" style={{ marginLeft: 6 }}>Live</span>}</td><td style={{ whiteSpace: "normal" }}>{h.whatChanged || "—"}</td><td>{h.changeLevel ? h.changeLevel.toLowerCase() : "first"}</td><td>{fmtDateTime(h.publishedAt)}</td><td>{h.publishedBy}{h.author && h.author !== h.publishedBy ? <div className="tt-sub">written by {h.author}</div> : null}</td><td>{h.status === "SUPERSEDED" && data.canPublish && !data.draft && c.status !== "ARCHIVED" && <button type="button" className="quiet-button" onClick={() => void rollback(h.id, h.label)}>Roll back to this</button>}</td></tr>)}
            {data.history.length === 0 && <tr><td colSpan={6} className="table-state compact-empty-state">Not published yet.</td></tr>}
          </tbody>
        </table></div><div className="tt-body tt-sub">Rolling back republishes an older revision as a new one. Nothing is overwritten.</div></section>
      )}

      {editQ && (
        <div className="tt-backdrop center" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setEditQ(null); }}>
          <div className="tt-dialog wide" role="dialog" aria-modal="true" aria-label="Question">
            <header><h2>{editQ.scope === "FINAL" ? "Final quiz question" : "Knowledge check question"}</h2><button type="button" className="tt-x" aria-label="Close" onClick={() => setEditQ(null)}>×</button></header>
            <div className="tt-body">
              <label className="tt-field">Question<textarea rows={2} value={editQ.prompt} onChange={(e) => setEditQ({ ...editQ, prompt: e.target.value })} autoFocus /></label>
              <span className="tt-sub">Tick the right answer. Tick more than one if several are right (the learner must pick all of them).</span>
              <div className="tt-qedit">
                {editQ.options.map((o, i) => (
                  <div key={i} className="opt">
                    <input type="checkbox" aria-label={`Answer ${i + 1} is right`} checked={editQ.answer.includes(i)} onChange={(e) => setEditQ({ ...editQ, answer: e.target.checked ? [...editQ.answer, i] : editQ.answer.filter((a) => a !== i) })} />
                    <input type="text" aria-label={`Answer ${i + 1}`} value={o} onChange={(e) => { const opts = [...editQ.options]; opts[i] = e.target.value; setEditQ({ ...editQ, options: opts }); }} placeholder={`Answer ${i + 1}`} />
                    {editQ.options.length > 2 && <button type="button" className="quiet-button" aria-label="Remove answer" onClick={() => setEditQ({ ...editQ, options: editQ.options.filter((_, j) => j !== i), answer: editQ.answer.filter((a) => a !== i).map((a) => (a > i ? a - 1 : a)) })}><X size={12} /></button>}
                  </div>
                ))}
                {editQ.options.length < 8 && <button type="button" className="tt-link" style={{ justifySelf: "start" }} onClick={() => setEditQ({ ...editQ, options: [...editQ.options, ""] })}>+ Answer</button>}
              </div>
              <div className="tt-grid2">
                <label className="tt-field">Lesson to revise if wrong<select value={editQ.lessonKey} onChange={(e) => setEditQ({ ...editQ, lessonKey: e.target.value })}><option value="">—</option>{lessons.filter((l) => editQ.scope === "FINAL" || l.chapterKey === editQ.chapterKey).map((l) => <option key={l.stableKey} value={l.stableKey}>{l.title}</option>)}</select></label>
                {editQ.scope === "CHECK" && <label className="tt-field">Chapter<select value={editQ.chapterKey} onChange={(e) => setEditQ({ ...editQ, chapterKey: e.target.value })}>{chapters.map((ch) => <option key={ch.key} value={ch.key}>{ch.title}</option>)}</select></label>}
              </div>
              <label className="tt-field">Explanation (shown after knowledge checks and revision cards)<textarea rows={2} value={editQ.explanation} onChange={(e) => setEditQ({ ...editQ, explanation: e.target.value })} /></label>
              {error && <div className="inline-error">{error}</div>}
            </div>
            <footer><button type="button" className="quiet-button" onClick={() => setEditQ(null)}>Cancel</button><button type="button" className="gold-button" onClick={saveQuestion}>Done</button></footer>
          </div>
        </div>
      )}

      {publish && (
        <div className="tt-backdrop center" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setPublish(null); }}>
          <div className="tt-dialog" role="dialog" aria-modal="true" aria-label="Publish">
            <header><h2>{publish.kind === "submit" ? "Submit for review" : publish.kind === "return" ? "Send back to the author" : neverPublished ? "Publish the course" : "Publish the draft"}</h2><button type="button" className="tt-x" aria-label="Close" onClick={() => setPublish(null)}>×</button></header>
            <div className="tt-body">
              {publish.kind === "return" ? <label className="tt-field">What needs to change<textarea rows={3} value={publish.comment} onChange={(e) => setPublish({ ...publish, comment: e.target.value })} autoFocus /></label> : <>
                {!neverPublished && <>
                  <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 6 }}><legend className="tt-sub" style={{ fontWeight: 700, marginBottom: 4 }}>Change level</legend>
                    <label className="tt-check"><input type="radio" checked={publish.level === "MINOR"} onChange={() => setPublish({ ...publish, level: "MINOR", askHolders: false })} /><span><strong>Minor</strong> · wording, typos, layout, better diagrams<small>Nobody redoes anything.</small></span></label>
                    <label className="tt-check"><input type="radio" checked={publish.level === "MAJOR"} onChange={() => setPublish({ ...publish, level: "MAJOR" })} /><span><strong>Major</strong> · procedure, specification, safety or quiz changed<small>{data.impact.inProgress} learner{data.impact.inProgress === 1 ? "" : "s"} part-way through redo the {diff ? diff.counts.changed + diff.counts.added : 0} changed and new lessons.</small></span></label>
                  </fieldset>
                  {publish.level === "MAJOR" && publish.kind === "publish" && data.impact.certified > 0 && <label className="tt-check"><input type="checkbox" checked={publish.askHolders} onChange={(e) => setPublish({ ...publish, askHolders: e.target.checked })} /><span><strong>Ask the {data.impact.certified} certificate holders to update</strong><small>They redo the changed lessons and the quiz; their certificate stays valid meanwhile and a refreshed one is approved afterwards.</small></span></label>}
                </>}
                <label className="tt-field">{neverPublished ? "Release note (optional)" : "What changed (shown to learners) *"}<textarea rows={3} value={publish.whatChanged} onChange={(e) => setPublish({ ...publish, whatChanged: e.target.value })} placeholder="e.g. Wooden blocks are no longer allowed as support. Rated stands are now required." /></label>
                {publish.kind === "publish" && <span className="tt-sub">Published by {"you"}. The revision is frozen and kept; every publish is recorded in the audit trail.</span>}
              </>}
            </div>
            <footer><button type="button" className="quiet-button" onClick={() => setPublish(null)}>Cancel</button><button type="button" className="gold-button" disabled={busy || (publish.kind === "return" ? publish.comment.trim().length < 3 : !neverPublished && publish.whatChanged.trim().length < 5)} onClick={() => void doPublish()}>{busy ? <Loader2 className="spin" size={14} /> : null}{publish.kind === "submit" ? "Submit" : publish.kind === "return" ? "Send back" : "Publish"}</button></footer>
          </div>
        </div>
      )}
      {dialog}
    </div>
  );
}

function QuestionRow({ q, n, lessons, editable, onEdit, onDelete }: { q: DraftQuestion; n: number; lessons: DraftLesson[]; editable: boolean; onEdit: () => void; onDelete: () => void }) {
  const lesson = lessons.find((l) => l.stableKey === q.lessonKey);
  return (
    <div className="tt-qedit">
      <div className="tt-bar" style={{ alignItems: "flex-start" }}>
        <strong className="tt-grow">{n}. {q.prompt || <span className="tt-muted">No question text</span>}</strong>
        {editable && <><button type="button" className="quiet-button" onClick={onEdit}>Edit</button><button type="button" className="quiet-button" aria-label="Delete question" onClick={onDelete}><Trash2 size={12} /></button></>}
      </div>
      <ol style={{ margin: 0, paddingLeft: 22, fontSize: 13 }}>{q.options.map((o, i) => <li key={i} style={{ color: q.answer.includes(i) ? "#1e7b4f" : undefined, fontWeight: q.answer.includes(i) ? 700 : 400 }}>{o}{q.answer.includes(i) ? " ✓" : ""}</li>)}</ol>
      {lesson && <span className="tt-sub">Revise: {lesson.title}</span>}
    </div>
  );
}
