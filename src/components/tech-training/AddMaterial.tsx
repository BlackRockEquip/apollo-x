"use client";

import "./tt.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import type { DraftLesson, PrototypeCourse, PrototypeImagePack } from "@/lib/training/model";
import { errText, readFileAsBase64, tt } from "./api";

type Source = "write" | "document" | "folder" | "copy";
type Preview = { title: string; lessons: DraftLesson[]; warnings: Array<{ lesson: string; message: string }>; stats: { chapters: number; lessons: number; tables: number; images: number; pdfPages: number; words: number } };
type CourseRow = { id: string; code: string; title: string; group: string; completionMode: string };

const SOURCES: Array<{ id: Source; title: string; text: string }> = [
  { id: "write", title: "Write in Flo X", text: "Start blank and type the lessons. Text only is fine." },
  { id: "document", title: "Import Word or PDF", text: "Headings become chapters and lessons. Tables are kept." },
  { id: "folder", title: "Import course folder", text: "Courses from the Service Tech Training folder (courses.json and image packs)." },
  { id: "copy", title: "Copy a course", text: "Start from an existing course and change what you need." },
];

function codeFrom(title: string) {
  return title.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 16) || "COURSE";
}

// Add training material (2026-11-28): write, import a Word / PDF / text file, import a course folder, or copy a course.
export function AddMaterial() {
  const router = useRouter();
  const [source, setSource] = useState<Source>("write");
  const [details, setDetails] = useState({ code: "", title: "", group: "", completionMode: "QUIZ_CERTIFICATE", reviewMonths: 12, requiredPositionIds: [] as string[] });
  const [groups, setGroups] = useState<string[]>([]);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [positions, setPositions] = useState<Array<{ id: string; name: string; active: boolean }>>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [pdfAsLesson, setPdfAsLesson] = useState(false);
  const [copyFrom, setCopyFrom] = useState("");
  const [folder, setFolder] = useState<{ courses: PrototypeCourse[]; packs: Record<string, PrototypeImagePack>; pick: string; publish: boolean } | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    tt<{ items: CourseRow[] }>("manage/courses").then((d) => { setCourses(d.items); setGroups([...new Set(d.items.map((c) => c.group))].sort()); }).catch(() => {});
    tt<{ items: Array<{ id: string; name: string; active: boolean }> }>("positions").then((d) => setPositions(d.items.filter((p) => p.active))).catch(() => {});
  }, []);

  const set = (patch: Partial<typeof details>) => setDetails((d) => ({ ...d, ...patch }));

  async function onDocument(file: File | undefined) {
    if (!file) return;
    setError(""); setPreview(null); setDocFile(file); setBusy(true);
    try {
      const p = await tt<Preview>("manage/import/document", { method: "POST", body: { fileName: file.name, dataBase64: await readFileAsBase64(file) } });
      setPreview(p);
      if (!details.title) set({ title: p.title, code: details.code || codeFrom(p.title) });
      setPdfAsLesson(file.name.toLowerCase().endsWith(".pdf") && p.stats.words < 50);
    } catch (e) { setError(errText(e, "That file could not be read.")); }
    finally { setBusy(false); }
  }

  async function onFolder(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    const coursesFound: PrototypeCourse[] = [];
    const packs: Record<string, PrototypeImagePack> = {};
    for (const f of Array.from(files)) {
      if (!f.name.toLowerCase().endsWith(".json")) continue;
      try {
        const json = JSON.parse(await f.text());
        if (Array.isArray(json)) coursesFound.push(...json.filter((c) => c && typeof c.id === "string" && Array.isArray(c.chapters)));
        else if (json && typeof json.id === "string" && Array.isArray(json.chapters)) coursesFound.push(json);
        else if (json && json.pages && json.img) {
          const key = Object.keys(json.pages)[0]?.split("|")[0] ?? "";
          const id = f.name.replace(/\.json$/i, "");
          packs[id] = json;
          if (key) packs[`__${key}`] = json;
        }
      } catch { setError(`${f.name} is not valid JSON.`); }
    }
    if (!coursesFound.length) { setError("No courses found. Choose courses.json from the Service Tech Training folder (and the img/*.json packs for diagrams)."); return; }
    setFolder({ courses: coursesFound, packs, pick: coursesFound[0].id, publish: false });
    const first = coursesFound[0];
    set({ title: first.title, code: first.id.toUpperCase().slice(0, 24), group: first.group });
  }

  const folderCourse = folder?.courses.find((c) => c.id === folder.pick) ?? null;
  const folderPack = useMemo(() => {
    if (!folder || !folderCourse) return null;
    return folder.packs[folderCourse.id] ?? Object.entries(folder.packs).find(([k]) => k.startsWith("__") && k.slice(2).startsWith(folderCourse.id))?.[1] ?? null;
  }, [folder, folderCourse]);

  async function create() {
    setBusy(true); setError("");
    try {
      let id: string;
      if (source === "folder") {
        if (!folderCourse) throw new Error("Choose a course from the folder.");
        const r = await tt<{ id: string }>("manage/import/prototype", { method: "POST", body: { course: { ...folderCourse, title: details.title || folderCourse.title, group: details.group || folderCourse.group }, images: folderPack, code: details.code, publish: folder!.publish } });
        id = r.id;
      } else {
        const body: Record<string, unknown> = { ...details, title: details.title.trim(), code: details.code.trim(), group: details.group.trim() };
        if (source === "copy") { if (!copyFrom) throw new Error("Pick the course to copy."); body.copyFromCourseId = copyFrom; }
        if (source === "document") {
          if (!preview || !docFile) throw new Error("Add a file first.");
          if (pdfAsLesson) body.pdfAttachment = { name: docFile.name, base64: await readFileAsBase64(docFile) };
          else body.lessons = preview.lessons;
        }
        if (source === "write") body.lessons = [{ stableKey: `l-${Date.now().toString(36)}`, chapterKey: `ch-${Date.now().toString(36)}`, chapterTitle: "Chapter 1", topicTitle: "", title: "Lesson 1", format: "TEXT", objective: "", pages: [""], pageImages: [""], pdfAssetId: null, videoUrl: null, safetyPoint: "", practicalTask: "" }];
        id = (await tt<{ id: string }>("manage/courses", { method: "POST", body })).id;
      }
      router.push(`/tech-training/manage/${id}`);
    } catch (e) { setError(errText(e, "Unable to create the course.")); setBusy(false); }
  }

  const ready = details.title.trim().length >= 2 && details.code.trim().length >= 1 && details.group.trim().length >= 1 && (source !== "document" || !!preview) && (source !== "copy" || !!copyFrom) && (source !== "folder" || !!folderCourse);
  return (
    <div className="tt">
      <div className="tt-sub"><Link className="tt-link" href="/tech-training/manage">Course manager</Link> / New</div>
      <header className="page-header compact"><div><p className="eyebrow">Course manager · new</p><h1>Add training material</h1><p>The new course is saved as a draft; nobody sees it until it is reviewed and published.</p></div></header>
      <div className="tt-steps"><span className="done">1 · Source</span><span className="on">2 · Details</span><span>3 · Edit and add a quiz</span><span>4 · Review and publish</span></div>
      <div className="tt-grid3" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        {SOURCES.map((s) => <button key={s.id} type="button" className="tt-source" aria-pressed={source === s.id} onClick={() => { setSource(s.id); setError(""); }}><strong>{s.title}</strong><span>{s.text}</span></button>)}
      </div>
      {error && <div className="inline-error">{error}</div>}
      <div className="tt-split" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>
        <section className="tt-card">
          <header><h3>Course details</h3></header>
          <div className="tt-body tt-grid2">
            {source === "copy" && <label className="tt-field full">Course to copy<select value={copyFrom} onChange={(e) => { setCopyFrom(e.target.value); const c = courses.find((x) => x.id === e.target.value); if (c) set({ title: `${c.title} (copy)`, code: `${c.code}-2`.slice(0, 24), group: c.group, completionMode: c.completionMode }); }}><option value="">Choose…</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.title} ({c.code})</option>)}</select></label>}
            <label className="tt-field">Course code *<input className="tt-mono" value={details.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} placeholder="e.g. SAF-2" /></label>
            <label className="tt-field">Group *<input list="tt-groups" value={details.group} onChange={(e) => set({ group: e.target.value })} placeholder="e.g. Safety" /><datalist id="tt-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist></label>
            <label className="tt-field full">Title *<input value={details.title} onChange={(e) => set({ title: e.target.value, code: details.code || "" })} onBlur={() => { if (!details.code && details.title) set({ code: codeFrom(details.title) }); }} /></label>
            <label className="tt-field">Review every<select value={details.reviewMonths} onChange={(e) => set({ reviewMonths: Number(e.target.value) })}>{[6, 12, 24, 36].map((m) => <option key={m} value={m}>{m} months</option>)}</select><span className="hint">You (the course owner) are reminded when it is due</span></label>
            {source !== "folder" && <fieldset className="full" style={{ border: "1px solid #e2e6ec", borderRadius: 8, padding: "10px 12px", margin: 0, display: "grid", gap: 6 }}>
              <legend className="tt-sub" style={{ fontWeight: 700, padding: "0 4px" }}>How is it completed?</legend>
              <label style={{ display: "flex", gap: 8, fontSize: 13.5 }}><input type="radio" checked={details.completionMode === "QUIZ_CERTIFICATE"} onChange={() => set({ completionMode: "QUIZ_CERTIFICATE" })} /><span><strong>Quiz, then manager approval, then certificate</strong><br /><span className="tt-sub">You add the quiz questions in the editor (at least 5)</span></span></label>
              <label style={{ display: "flex", gap: 8, fontSize: 13.5 }}><input type="radio" checked={details.completionMode === "ACKNOWLEDGE"} onChange={() => set({ completionMode: "ACKNOWLEDGE" })} /><span><strong>Read and acknowledge</strong><br /><span className="tt-sub">For policies and procedures: the learner signs that they have read it. No quiz or certificate.</span></span></label>
            </fieldset>}
            {positions.length > 0 && source !== "folder" && <div className="full"><span className="tt-sub" style={{ fontWeight: 700 }}>Required for positions</span><div className="tt-bar" style={{ marginTop: 6 }}>{positions.map((p) => { const on = details.requiredPositionIds.includes(p.id); return <button key={p.id} type="button" className="tt-pill" style={{ cursor: "pointer", border: 0, background: on ? "#0f1b2d" : undefined, color: on ? "#fff" : undefined }} onClick={() => set({ requiredPositionIds: on ? details.requiredPositionIds.filter((x) => x !== p.id) : [...details.requiredPositionIds, p.id] })}>{on ? "✓ " : "+ "}{p.name}</button>; })}</div></div>}
          </div>
        </section>

        <section className="tt-card">
          <header><h3>{source === "document" ? "Import preview" : source === "folder" ? "Course folder" : source === "copy" ? "What is copied" : "Start writing"}</h3></header>
          <div className="tt-body">
            {source === "write" && <p className="tt-sub" style={{ margin: 0 }}>The course opens in the editor with one empty lesson. Add chapters and lessons, type the text, add tables, safety points, images (optional), a PDF or a video link.</p>}
            {source === "copy" && <p className="tt-sub" style={{ margin: 0 }}>The lessons, diagrams and quiz questions of the course are copied into a new draft course. Its history and learners stay with the original.</p>}
            {source === "document" && <>
              <label className={`tt-drop ${over ? "over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); void onDocument(e.dataTransfer.files?.[0]); }}>
                <FileUp size={22} /><b>{docFile ? docFile.name : "Drop a Word (.docx), PDF, .txt or .md file"}</b><span>or click to choose · headings become chapters and lessons</span>
                <input type="file" hidden accept=".docx,.pdf,.txt,.md" onChange={(e) => void onDocument(e.target.files?.[0])} />
              </label>
              {busy && <div className="table-state"><Loader2 className="spin" size={18} /> Reading the file…</div>}
              {preview && <>
                <div className="tt-kpis" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
                  <div className="tt-kpi"><b>{preview.stats.chapters}</b><span>Chapters</span></div><div className="tt-kpi"><b>{preview.stats.lessons}</b><span>Lessons</span></div><div className="tt-kpi"><b>{preview.stats.tables}</b><span>Tables</span></div><div className="tt-kpi"><b>{preview.stats.words}</b><span>Words</span></div>
                </div>
                <div style={{ maxHeight: 260, overflow: "auto", fontSize: 13 }}>
                  {[...new Set(preview.lessons.map((l) => l.chapterKey))].map((key) => { const ls = preview.lessons.filter((l) => l.chapterKey === key); return <div key={key} style={{ borderBottom: "1px solid #edeff2", padding: "6px 0" }}><strong>{ls[0].chapterTitle}</strong><div className="tt-sub">{ls.map((l) => `${l.title} (${l.pages.length} p)`).join(" · ")}</div></div>; })}
                </div>
                {preview.warnings.length > 0 && <div className="tt-note"><strong>Check before publishing:</strong><ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{preview.warnings.slice(0, 8).map((w, i) => <li key={i}><strong>{w.lesson}:</strong> {w.message}</li>)}</ul></div>}
                {docFile?.name.toLowerCase().endsWith(".pdf") && <label className="tt-check"><input type="checkbox" checked={pdfAsLesson} onChange={(e) => setPdfAsLesson(e.target.checked)} /><span><strong>Attach the PDF as one Document lesson instead</strong><small>Learners open the PDF itself. Use this for scanned documents or when the layout matters.</small></span></label>}
              </>}
            </>}
            {source === "folder" && <>
              <label className="tt-drop"><FileUp size={22} /><b>Choose courses.json and the img/*.json image packs</b><span>Select several files at once. Courses without an image pack come in as text.</span><input type="file" hidden multiple accept=".json,application/json" onChange={(e) => void onFolder(e.target.files)} /></label>
              {folder && <>
                <label className="tt-field">Course<select value={folder.pick} onChange={(e) => { const c = folder.courses.find((x) => x.id === e.target.value)!; setFolder({ ...folder, pick: c.id }); set({ title: c.title, code: c.id.toUpperCase().slice(0, 24), group: c.group }); }}>{folder.courses.map((c) => <option key={c.id} value={c.id}>{c.title} ({c.id})</option>)}</select></label>
                {folderCourse && <div className="tt-note info">{folderCourse.chapters.length} chapters · {folderCourse.chapters.reduce((n, ch) => n + ch.topics.reduce((m, t) => m + t.lessons.length, 0), 0)} lessons · {folderPack ? `${Object.keys(folderPack.img).length} diagrams` : "no image pack chosen (text only)"}</div>}
                <label className="tt-check"><input type="checkbox" checked={folder.publish} onChange={(e) => setFolder({ ...folder, publish: e.target.checked })} /><span><strong>Publish straight away</strong><small>Learners can start reading at once. Certificates still need a final quiz, added as a new revision.</small></span></label>
              </>}
            </>}
          </div>
        </section>
      </div>
      <div className="tt-bar"><span className="tt-grow" /><Link className="quiet-button" href="/tech-training/manage">Cancel</Link><button type="button" className="gold-button" disabled={!ready || busy} onClick={() => void create()}>{busy ? <Loader2 className="spin" size={14} /> : null} Create and open in the editor →</button></div>
    </div>
  );
}
