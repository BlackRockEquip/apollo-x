"use client";

import "./tt.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Copy, Loader2, PackageOpen, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { errText, fmtDate, STATUS_LABEL, statusTone, tt } from "./api";

type Item = {
  id: string; code: string; title: string; group: string; status: string; completionMode: string; docNumber: string; liveRevision: string | null; draftStatus: string | null; draftId: string | null;
  lessons: number; format: string; learners: number; quizMissing: boolean; imagesMissing: boolean; reviewDue: boolean; reviewOverdue: boolean; nextReviewAt: string | null; owner: string; updatedAt: string | null; hasCover: boolean; archivedAt: string | null;
};
type Impact = { inProgress: number; certified: number; positions: string[]; replacements: Array<{ id: string; title: string; code: string }> };
type CatItem = { id: string; title: string; group: string; lessons: number; pages: number; hasImages: boolean; importedCourseId: string | null };

// Course manager (2026-11-28): every course with its life cycle. Draft -> In review -> Published -> Archived (restorable).
// Only a course that was never published can be deleted; published material holds training records, so it is archived instead.
export function CourseManager() {
  const router = useRouter();
  const { confirm, dialog } = useConfirmDialog();
  const [items, setItems] = useState<Item[] | null>(null);
  const [tab, setTab] = useState<"active" | "drafts" | "archived">("active");
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [archive, setArchive] = useState<{ item: Item; impact: Impact; reason: string; mode: "FINISH" | "MOVE" | "STOP"; finishBy: string; replacement: string } | null>(null);
  const [copy, setCopy] = useState<{ item: Item; code: string; title: string } | null>(null);
  const [cat, setCat] = useState<CatItem[] | null>(null);

  const load = useCallback(() => tt<{ items: Item[] }>("manage/courses").then((d) => setItems(d.items)).catch((e) => setError(errText(e, "Unable to load courses."))), []);
  useEffect(() => { void load(); tt<{ available: boolean; items: CatItem[] }>("manage/import/cat").then((d) => setCat(d.available ? d.items : [])).catch(() => setCat([])); }, [load]);

  const shown = useMemo(() => (items ?? []).filter((i) => (tab === "archived" ? i.status === "ARCHIVED" : tab === "drafts" ? !!i.draftStatus || i.status === "DRAFT" : i.status !== "ARCHIVED")).filter((i) => !q.trim() || `${i.title} ${i.code} ${i.group}`.toLowerCase().includes(q.trim().toLowerCase())), [items, tab, q]);
  const counts = useMemo(() => ({ active: (items ?? []).filter((i) => i.status !== "ARCHIVED").length, drafts: (items ?? []).filter((i) => i.draftStatus || i.status === "DRAFT").length, archived: (items ?? []).filter((i) => i.status === "ARCHIVED").length }), [items]);
  const catLeft = (cat ?? []).filter((c) => !c.importedCourseId);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setError(""); setNotice("");
    try { await fn(); setNotice(ok); await load(); } catch (e) { setError(errText(e, "That did not work.")); } finally { setBusy(false); }
  }

  async function openArchive(item: Item) {
    try { const impact = await tt<Impact>(`manage/courses/${item.id}/archive`); setArchive({ item, impact, reason: "", mode: "FINISH", finishBy: "", replacement: "" }); }
    catch (e) { setError(errText(e, "Unable to check the course.")); }
  }

  async function remove(item: Item) {
    if (!(await confirm({ title: "Delete course?", message: `Delete the draft course "${item.title}"? It was never published, so no training records are lost.`, tone: "danger", confirmLabel: "Delete" }))) return;
    await run(() => tt(`manage/courses/${item.id}`, { method: "DELETE" }), "Course deleted.");
  }

  async function importCat() {
    setBusy(true); setError(""); setNotice("");
    try {
      const r = await tt<{ imported: Array<{ title: string; lessons: number; images: number }> }>("manage/import/cat", { method: "POST", body: {} });
      setNotice(`Imported ${r.imported.length} course${r.imported.length === 1 ? "" : "s"}: ${r.imported.map((c) => `${c.title} (${c.lessons} lessons, ${c.images} diagrams)`).join("; ")}. Add a final quiz to each before people can earn certificates.`);
      await load(); setCat((await tt<{ items: CatItem[] }>("manage/import/cat")).items);
    } catch (e) { setError(errText(e, "Import failed.")); }
    finally { setBusy(false); }
  }

  return (
    <div className="tt">
      <header className="page-header compact">
        <div><p className="eyebrow">Tech Training · Managers and Company Admins</p><h1>Course manager</h1><p>Add, update, archive and delete training material. Every change is a draft until it is reviewed and published.</p></div>
        <div className="tt-bar"><Link className="gold-button" href="/tech-training/manage/new"><Plus size={15} /> Add training material</Link></div>
      </header>
      <div className="tt-card"><div className="tt-body tt-lifecycle">
        <strong style={{ marginRight: 6 }}>Life cycle</strong>
        <span className="tt-pill">Draft</span>→<span className="tt-pill wait">In review</span>→<span className="tt-pill ok">Published</span>→<span className="tt-pill arc">Archived</span>
        <span className="tt-sub" style={{ marginLeft: 8 }}>Archived courses can be restored. Only drafts that were never published can be deleted.</span>
      </div></div>
      {error && <div className="inline-error">{error}</div>}
      {notice && <div className="tt-note ok">{notice}</div>}
      {catLeft.length > 0 && (
        <div className="tt-note info" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <PackageOpen size={16} /><span className="tt-grow"><strong>Cat Basics courses ready to import:</strong> {catLeft.map((c) => c.title).join(", ")}. {catLeft.some((c) => !c.hasImages) && `Diagrams are included for ${catLeft.filter((c) => c.hasImages).length} of them; the rest come in as text and the diagrams can be added later.`}</span>
          <button type="button" className="gold-button" disabled={busy} onClick={() => void importCat()}>{busy ? <Loader2 className="spin" size={14} /> : null} Import {catLeft.length} course{catLeft.length === 1 ? "" : "s"}</button>
        </div>
      )}
      <section className="master-panel">
        <div className="master-toolbar">
          <div className="tt-seg" role="group" aria-label="Show">
            <button type="button" aria-pressed={tab === "active"} onClick={() => setTab("active")}>All active · {counts.active}</button>
            <button type="button" aria-pressed={tab === "drafts"} onClick={() => setTab("drafts")}>Drafts and review · {counts.drafts}</button>
            <button type="button" aria-pressed={tab === "archived"} onClick={() => setTab("archived")}>Archived · {counts.archived}</button>
          </div>
          <label className="search-control"><Search size={15} /><input aria-label="Search courses" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search courses" /></label>
        </div>
        {!items ? <div className="table-state"><Loader2 className="spin" size={20} /></div> : (
          <div className="data-table-wrap"><table className="data-table">
            <thead><tr><th>Course</th><th>Format</th><th>Lessons</th><th>Live revision</th><th>Status</th><th>Learners</th><th>Next review</th><th style={{ width: 120 }}></th></tr></thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.id} className="row-click" tabIndex={0} onClick={() => router.push(`/tech-training/manage/${i.id}`)} onKeyDown={(e) => { if (e.key === "Enter") router.push(`/tech-training/manage/${i.id}`); }}>
                  <td><strong>{i.title}</strong><div className="tt-sub">{i.group} · <span className="tt-mono">{i.code}</span>{i.completionMode === "ACKNOWLEDGE" ? " · read & acknowledge" : ""}</div>
                    {i.quizMissing && <span className="tt-pill wait">Needs a final quiz</span>}{i.imagesMissing && <span className="tt-pill" style={{ marginLeft: 4 }}>Diagrams not added</span>}</td>
                  <td><span className="tt-pill">{i.format}</span></td>
                  <td>{i.lessons}</td>
                  <td className="tt-mono">{i.liveRevision ?? "—"}</td>
                  <td><span className={`tt-pill ${statusTone(i.status)}`}>{STATUS_LABEL[i.status]}</span>{i.draftStatus && i.status !== "DRAFT" && <div style={{ marginTop: 3 }}><span className={`tt-pill ${statusTone(i.draftStatus)}`}>{i.draftStatus === "IN_REVIEW" ? "Draft in review" : "Draft open"}</span></div>}</td>
                  <td>{i.learners || ""}</td>
                  <td>{i.reviewOverdue ? <span className="tt-pill bad">{fmtDate(i.nextReviewAt)}</span> : i.reviewDue ? <span className="tt-pill wait">{fmtDate(i.nextReviewAt)}</span> : fmtDate(i.nextReviewAt)}</td>
                  <td onClick={(e) => e.stopPropagation()}><div className="tt-bar" style={{ gap: 4, flexWrap: "nowrap" }}>
                    <button type="button" className="quiet-button" title="Copy into a new course" aria-label={`Copy ${i.title}`} onClick={() => setCopy({ item: i, code: `${i.code}-COPY`.slice(0, 24), title: `${i.title} (copy)` })}><Copy size={13} /></button>
                    {i.status === "PUBLISHED" && <button type="button" className="quiet-button" title="Archive" aria-label={`Archive ${i.title}`} onClick={() => void openArchive(i)}><Archive size={13} /></button>}
                    {i.status === "ARCHIVED" && <button type="button" className="quiet-button" title="Restore" aria-label={`Restore ${i.title}`} onClick={() => void run(() => tt(`manage/courses/${i.id}/restore`, { method: "POST" }), `"${i.title}" restored.`)}><RotateCcw size={13} /></button>}
                    {i.status === "DRAFT" && !i.liveRevision && <button type="button" className="quiet-button" title="Delete draft course" aria-label={`Delete ${i.title}`} onClick={() => void remove(i)}><Trash2 size={13} /></button>}
                  </div></td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={8} className="table-state compact-empty-state">{tab === "archived" ? "No archived courses." : tab === "drafts" ? "No drafts open." : "No courses yet. Add training material, or import the Cat Basics courses above."}</td></tr>}
            </tbody>
          </table></div>
        )}
      </section>
      <p className="tt-sub">Formats: text only, text with diagrams, text with tables, attached document (PDF), video link. A course does not need images.</p>

      {archive && (
        <div className="tt-backdrop center" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setArchive(null); }}>
          <div className="tt-dialog" role="dialog" aria-modal="true" aria-label="Archive course">
            <header><h2>Archive {archive.item.title}?</h2><button type="button" className="tt-x" aria-label="Close" onClick={() => setArchive(null)}>×</button></header>
            <div className="tt-body">
              <p className="tt-sub" style={{ margin: 0 }}>It leaves the catalogue and is removed from position requirements. All records stay for the retention period. You can restore it later.</p>
              <div className="tt-note info"><strong>{archive.impact.certified}</strong> certificates stay valid · <strong>{archive.impact.inProgress}</strong> learners are part-way through · {archive.impact.positions.length ? `required for ${archive.impact.positions.join(", ")}` : "not required by any position"}</div>
              {archive.impact.inProgress > 0 && (
                <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 6 }}><legend className="tt-sub" style={{ fontWeight: 700, marginBottom: 4 }}>Learners in progress</legend>
                  <label className="tt-check"><input type="radio" name="mode" checked={archive.mode === "FINISH"} onChange={() => setArchive({ ...archive, mode: "FINISH" })} /><span>Let them finish{archive.mode === "FINISH" && <> by <input type="date" value={archive.finishBy} onChange={(e) => setArchive({ ...archive, finishBy: e.target.value })} aria-label="Finish by" /></>}</span></label>
                  <label className="tt-check"><input type="radio" name="mode" checked={archive.mode === "MOVE"} onChange={() => setArchive({ ...archive, mode: "MOVE" })} /><span>Move them to another course, keeping lessons that match{archive.mode === "MOVE" && <select value={archive.replacement} onChange={(e) => setArchive({ ...archive, replacement: e.target.value })} aria-label="Replacement course" style={{ display: "block", marginTop: 6 }}><option value="">Choose a course…</option>{archive.impact.replacements.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</select>}</span></label>
                  <label className="tt-check"><input type="radio" name="mode" checked={archive.mode === "STOP"} onChange={() => setArchive({ ...archive, mode: "STOP" })} /><span>Stop now (their progress stays on record as withdrawn)</span></label>
                </fieldset>
              )}
              <label className="tt-field">Reason (required, kept in the audit log)<input value={archive.reason} onChange={(e) => setArchive({ ...archive, reason: e.target.value })} placeholder="e.g. Replaced by FDE 2 (2027) for C18 engines" /></label>
            </div>
            <footer><button type="button" className="quiet-button" onClick={() => setArchive(null)}>Cancel</button><button type="button" className="gold-button" style={{ background: "#5b3e96", borderColor: "#4a3180", color: "#fff" }} disabled={busy || archive.reason.trim().length < 5 || (archive.mode === "MOVE" && !archive.replacement)} onClick={() => void run(async () => { await tt(`manage/courses/${archive.item.id}/archive`, { method: "POST", body: { reason: archive.reason, inProgress: archive.impact.inProgress ? archive.mode : "FINISH", finishBy: archive.finishBy || null, replacementCourseId: archive.replacement || null } }); setArchive(null); }, `"${archive.item.title}" archived.`)}>Archive course</button></footer>
          </div>
        </div>
      )}
      {copy && (
        <div className="tt-backdrop center" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setCopy(null); }}>
          <div className="tt-dialog" role="dialog" aria-modal="true" aria-label="Copy course">
            <header><h2>Copy {copy.item.title}</h2><button type="button" className="tt-x" aria-label="Close" onClick={() => setCopy(null)}>×</button></header>
            <div className="tt-body tt-grid2">
              <label className="tt-field">New code<input className="tt-mono" value={copy.code} onChange={(e) => setCopy({ ...copy, code: e.target.value })} /></label>
              <label className="tt-field">New title<input value={copy.title} onChange={(e) => setCopy({ ...copy, title: e.target.value })} /></label>
              <span className="tt-sub full">Lessons, diagrams and quiz questions are copied into a new draft. Nothing changes in the original.</span>
            </div>
            <footer><button type="button" className="quiet-button" onClick={() => setCopy(null)}>Cancel</button><button type="button" className="gold-button" disabled={busy} onClick={() => void run(async () => { const r = await tt<{ id: string }>("manage/courses", { method: "POST", body: { code: copy.code, title: copy.title, group: copy.item.group, completionMode: copy.item.completionMode, copyFromCourseId: copy.item.id } }); setCopy(null); router.push(`/tech-training/manage/${r.id}`); }, "Copied.")}>Copy course</button></footer>
          </div>
        </div>
      )}
      {dialog}
    </div>
  );
}
