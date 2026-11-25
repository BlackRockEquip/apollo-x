"use client";

import "./failure-reports.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Copy, FileDown, Link2, Loader2, PenLine, RefreshCw, Trash2, Unlink } from "lucide-react";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import {
  DESC_HEADING_DEFAULT, FIELD_LABELS, JOB_FIELD_KEYS, photoRole, reportPageCount, type FieldKey, type JobFieldKey, type ListKey, type ReportFields, type WarrantyValue,
} from "@/lib/failure-reports/model";
import { buildPptx } from "./buildPptx";
import { base64Of, composite, normalisePhoto, readFile } from "./image";
import { JobPickerDialog } from "./JobPickerDialog";
import { PhotoMarkEditor, type MarkResult } from "./PhotoMarkEditor";
import { FALLBACK_PROFILE, themeOf } from "./theme";
import { frApi, profileForBuild, type JobHit, type Profile, type ReportDetail, type ReportPhoto } from "./types";

type SaveState = "saved" | "dirty" | "saving" | "error";
type Patch = { fields?: Partial<ReportFields>; warranty?: WarrantyValue; perPage?: number; descHeading?: string; profileId?: string | null; replace?: string[]; repair?: string[]; missing?: string[] };

const DETAIL_KEYS: FieldKey[] = ["job", "client", "component", "serial", "make", "model", "plant", "site", "date_delivery", "date_report", "repair_type", "artisan"];
const DATE_KEYS = new Set<FieldKey>(["date_delivery", "date_report", "rev_date"]);
const SUGGEST = new Set<string>(["client", "site", "component", "make", "model", "plant", "artisan", "repair_type", "doc_no"]);
const LISTS: Array<{ key: ListKey; title: string }> = [{ key: "replace", title: "REPLACE" }, { key: "repair", title: "REPAIR" }, { key: "missing", title: "MISSING" }];
const ROTATE_THUMB = 380;

// The failure report screen: the builder's three cards (Job details, Photos, Findings) on one page, saved as you type, with the
// linked job above (Refresh from job / Unlink / Link to a job) and Create Report, which builds the .pptx in the browser,
// downloads it and - for a report linked to a job - keeps a copy in the job's files.
export function FailureReportEditor({ initial, canEdit, canOpenJob }: { initial: ReportDetail; canEdit: boolean; canOpenJob: boolean }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirmDialog();
  const [report, setReport] = useState(initial);
  const [fields, setFields] = useState<ReportFields>(initial.fields);
  const [warranty, setWarranty] = useState<WarrantyValue>(initial.warranty);
  const [perPage, setPerPage] = useState(initial.perPage);
  const [descHeading, setDescHeading] = useState(initial.descHeading || DESC_HEADING_DEFAULT);
  const [lists, setLists] = useState<Record<ListKey, string[]>>({ replace: initial.replace, repair: initial.repair, missing: initial.missing });
  const [profileId, setProfileId] = useState<string | null>(initial.profileId);
  const [photos, setPhotos] = useState<ReportPhoto[]>(initial.photos);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [suggestions, setSuggestions] = useState<Record<string, string[]>>({});
  const [save, setSave] = useState<SaveState>("saved");
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [adding, setAdding] = useState<string>("");
  const [over, setOver] = useState(false);
  const [editing, setEditing] = useState<ReportPhoto | null>(null);
  const [linking, setLinking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const pending = useRef<Patch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captionTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const readOnly = !canEdit;

  // Company profiles and earlier values (for the drop-down suggestions).
  useEffect(() => {
    (async () => {
      try { setProfiles((await frApi<{ items: Profile[] }>("/api/v1/failure-reports/profiles?all=1")).items); } catch { /* the report still edits; Create Report says if no profile */ }
      try { setSuggestions((await frApi<{ suggestions: Record<string, string[]> }>("/api/v1/failure-reports/suggestions")).suggestions); } catch { /* suggestions are a convenience */ }
    })();
  }, []);

  // Thumbnails with the damage marks drawn on (a photo with no marks shows as it is).
  useEffect(() => {
    let live = true;
    (async () => {
      const next: Record<string, string> = {};
      for (const p of photos) if (p.marks.length) { try { next[p.id] = await composite(p.src, p.width, p.height, p.marks, ROTATE_THUMB); } catch { /* fall back to the plain photo */ } }
      if (live) setThumbs(next);
    })();
    return () => { live = false; };
  }, [photos]);

  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const body = pending.current;
    if (Object.keys(body).length === 0) return true;
    pending.current = {};
    setSave("saving");
    try {
      const saved = await frApi<ReportDetail>(`/api/v1/failure-reports/${report.id}`, { method: "PUT", body });
      setReport((r) => ({ ...r, updatedAt: saved.updatedAt, profileId: saved.profileId }));
      setSave(Object.keys(pending.current).length ? "dirty" : "saved");
      return true;
    } catch (e) {
      pending.current = { ...body, ...pending.current, fields: { ...body.fields, ...pending.current.fields } };
      setSave("error"); setMessage({ tone: "err", text: e instanceof Error ? e.message : "Could not save. Check the connection and try again." });
      return false;
    }
  }, [report.id]);

  const queue = useCallback((patch: Patch) => {
    if (readOnly) return;
    const p = pending.current;
    pending.current = { ...p, ...patch, ...(patch.fields || p.fields ? { fields: { ...p.fields, ...patch.fields } } : {}) };
    setSave("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, 700);
  }, [flush, readOnly]);

  // Save before leaving the page.
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => { if (Object.keys(pending.current).length) { void flush(); e.preventDefault(); } };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [flush]);

  const setField = (key: FieldKey, value: string) => { setFields((f) => ({ ...f, [key]: value })); queue({ fields: { [key]: value } }); };
  const setList = (key: ListKey, value: string[]) => { setLists((l) => ({ ...l, [key]: value })); queue({ [key]: value }); };

  const profile = useMemo(() => profiles.find((p) => p.id === profileId) ?? profiles.find((p) => p.isDefault && p.active) ?? profiles[0] ?? null, [profiles, profileId]);
  const theme = useMemo(() => themeOf(profile ? profileForBuild(profile) : FALLBACK_PROFILE), [profile]);
  const themeVars = { "--fr-dark": `#${theme.dark}`, "--fr-accent": `#${theme.accent}`, "--fr-na": `#${theme.naFill}`, "--fr-na-text": `#${theme.naText}` } as CSSProperties;
  const pages = reportPageCount(photos.length, perPage);
  const fromJob = report.jobValues;
  const isFromJob = (key: FieldKey) => !!report.jobId && !!fromJob && (JOB_FIELD_KEYS as readonly string[]).includes(key) && (fromJob[key as JobFieldKey] ?? "") !== "" && fields[key].trim() === fromJob[key as JobFieldKey];
  const isEditedFromJob = (key: FieldKey) => !!report.jobId && !!fromJob && (JOB_FIELD_KEYS as readonly string[]).includes(key) && (fromJob[key as JobFieldKey] ?? "") !== "" && fields[key].trim() !== fromJob[key as JobFieldKey];

  // ---- job link ----
  async function applyLink(jobId: string | null, overwriteEdited = false) {
    await flush();
    const r = await frApi<{ report: ReportDetail; updated: JobFieldKey[]; keptEdited: JobFieldKey[] }>(`/api/v1/failure-reports/${report.id}/job`, { method: "PUT", body: { jobId, overwriteEdited } });
    setReport(r.report); setFields(r.report.fields);
    return r;
  }

  async function refreshFromJob() {
    if (!report.jobId) return;
    try {
      const check = await frApi<{ linked: boolean; differs: JobFieldKey[]; edited: JobFieldKey[] }>(`/api/v1/failure-reports/${report.id}/job`);
      await flush();
      let overwrite = false;
      const editedByUser = check.edited.filter((k) => fromJob && (fromJob[k] ?? "") !== fields[k].trim());
      if (editedByUser.length) {
        overwrite = await confirm({ title: "Replace your changes?", message: `You changed ${editedByUser.map((k) => FIELD_LABELS[k]).join(", ")} on this report. Replace ${editedByUser.length === 1 ? "it" : "them"} with what the job says now too? Choose Keep mine to update only the fields you have not changed.`, tone: "warning", confirmLabel: "Replace with job", cancelLabel: "Keep mine" });
      }
      const r = await applyLink(report.jobId, overwrite);
      setMessage({ tone: "ok", text: r.updated.length ? `Updated from job ${r.report.jobLabel}: ${r.updated.map((k) => FIELD_LABELS[k]).join(", ")}.${r.keptEdited.length ? ` Kept your ${r.keptEdited.map((k) => FIELD_LABELS[k]).join(", ")}.` : ""}` : `Already up to date with job ${r.report.jobLabel}.` });
    } catch (e) { setMessage({ tone: "err", text: e instanceof Error ? e.message : "Unable to refresh from the job." }); }
  }

  async function pickJob(job: JobHit | null) {
    if (!job) { setLinking(false); return; }
    try {
      const r = await applyLink(job.id);
      setLinking(false);
      setMessage({ tone: "ok", text: `Linked to job ${r.report.jobLabel}.${r.updated.length ? ` Filled in: ${r.updated.map((k) => FIELD_LABELS[k]).join(", ")}.` : ""}${r.keptEdited.length ? ` Kept what you typed in ${r.keptEdited.map((k) => FIELD_LABELS[k]).join(", ")} - use Refresh from job to replace it.` : ""}` });
    } catch (e) { setMessage({ tone: "err", text: e instanceof Error ? e.message : "Unable to link the job." }); setLinking(false); }
  }

  async function unlink() {
    if (!(await confirm({ title: "Unlink the job?", message: `The report keeps everything it says now, but it will no longer be tied to job ${report.jobLabel}, and Create Report will not save a copy in the job's files.`, confirmLabel: "Unlink" }))) return;
    try { await applyLink(null); setMessage({ tone: "ok", text: "The report is no longer linked to a job." }); }
    catch (e) { setMessage({ tone: "err", text: e instanceof Error ? e.message : "Unable to unlink the job." }); }
  }

  // ---- photos ----
  async function addFiles(files: FileList | File[]) {
    if (readOnly) return;
    const list = Array.from(files).filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|bmp|gif)$/i.test(f.name));
    if (!list.length) { setMessage({ tone: "err", text: "No photos found in what was dropped." }); return; }
    list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const bad: string[] = [];
    let latest: ReportDetail | null = null;
    for (let i = 0; i < list.length; i++) {
      setAdding(`Adding photos… ${i + 1}/${list.length}`);
      try {
        const r = await normalisePhoto(await readFile(list[i]));
        latest = await frApi<ReportDetail>(`/api/v1/failure-reports/${report.id}/photos`, { method: "POST", body: { fileName: list[i].name, contentBase64: base64Of(r.data), width: r.w, height: r.h } });
        setPhotos(latest.photos);
      } catch (e) {
        bad.push(list[i].name);
        if (e instanceof Error && /up to \d+ photos/.test(e.message)) { setMessage({ tone: "err", text: e.message }); break; }
      }
    }
    setAdding("");
    if (latest) setReport((r) => ({ ...r, updatedAt: latest!.updatedAt }));
    setMessage(bad.length ? { tone: "err", text: `Added ${list.length - bad.length} photo(s). Could not read: ${bad.join(", ")} (save HEIC photos as JPG first).` } : { tone: "ok", text: `Added ${list.length} photo(s).` });
  }

  function setCaption(photo: ReportPhoto, caption: string) {
    setPhotos((list) => list.map((p) => (p.id === photo.id ? { ...p, caption } : p)));
    setSave("dirty");
    clearTimeout(captionTimers.current[photo.id]);
    captionTimers.current[photo.id] = setTimeout(async () => {
      try { await frApi(`/api/v1/failure-reports/${report.id}/photos/${photo.id}`, { method: "PUT", body: { caption } }); setSave(Object.keys(pending.current).length ? "dirty" : "saved"); }
      catch (e) { setSave("error"); setMessage({ tone: "err", text: e instanceof Error ? e.message : "Could not save the photo description." }); }
    }, 700);
  }

  async function move(a: number, b: number) {
    if (readOnly || b < 0 || b >= photos.length || a === b) return;
    const next = [...photos]; const [p] = next.splice(a, 1); next.splice(b, 0, p);
    setPhotos(next);
    try { const r = await frApi<ReportDetail>(`/api/v1/failure-reports/${report.id}/photos`, { method: "PUT", body: { order: next.map((x) => x.id) } }); setPhotos(r.photos); }
    catch (e) { setMessage({ tone: "err", text: e instanceof Error ? e.message : "Could not move the photo." }); }
  }

  async function removePhoto(index: number) {
    const p = photos[index];
    if (!(await confirm({ message: `Delete photo ${index + 1}?`, tone: "danger", confirmLabel: "Delete" }))) return;
    try { const r = await frApi<ReportDetail>(`/api/v1/failure-reports/${report.id}/photos/${p.id}`, { method: "DELETE" }); setPhotos(r.photos); }
    catch (e) { setMessage({ tone: "err", text: e instanceof Error ? e.message : "Could not delete the photo." }); }
  }

  async function saveMarks(photo: ReportPhoto, result: MarkResult) {
    setEditing(null);
    try {
      const body: Record<string, unknown> = { marks: result.marks };
      if (result.rotated) body.image = { contentBase64: base64Of(result.rotated.data), width: result.rotated.w, height: result.rotated.h };
      const r = await frApi<ReportDetail>(`/api/v1/failure-reports/${report.id}/photos/${photo.id}`, { method: "PUT", body });
      // Keep any description still being typed.
      setPhotos(r.photos.map((p) => ({ ...p, caption: photos.find((x) => x.id === p.id)?.caption ?? p.caption })));
      setMessage({ tone: "ok", text: "Photo marks saved - they will show on the report." });
    } catch (e) { setMessage({ tone: "err", text: e instanceof Error ? e.message : "Could not save the marks." }); }
  }

  // ---- create report ----
  async function createReport() {
    if (!profile) { setMessage({ tone: "err", text: "Add a company profile first (Company profiles)." }); return; }
    if (!fields.job.trim() && !(await confirm({ message: "No job number entered. Create the report anyway?", confirmLabel: "Create anyway" }))) return;
    if (!photos.length && !(await confirm({ message: "No photos added. Create the report anyway?", confirmLabel: "Create anyway" }))) return;
    setCreating(true); setMessage(null);
    try {
      await flush();
      Object.values(captionTimers.current).forEach((t) => clearTimeout(t));
      for (const p of photos) await frApi(`/api/v1/failure-reports/${report.id}/photos/${p.id}`, { method: "PUT", body: { caption: p.caption } }).catch(() => undefined);
      const built = await buildPptx({ fields, warranty, perPage, descHeading, replace: lists.replace, repair: lists.repair, missing: lists.missing, photos: photos.map((p) => ({ src: p.src, w: p.width, h: p.height, marks: p.marks, caption: p.caption })) }, profileForBuild(profile));
      const blob = (await built.pptx.write({ outputType: "blob", compression: true })) as Blob;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = built.fileName; document.body.append(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
      let note = "";
      try {
        const contentBase64 = report.jobId ? base64Of(await readFile(blob)) : undefined;
        const r = await frApi<{ report: ReportDetail; savedToJob: { fileName: string } | null }>(`/api/v1/failure-reports/${report.id}/created`, { method: "POST", body: { fileName: built.fileName, contentBase64 } });
        setReport((cur) => ({ ...cur, timesCreated: r.report.timesCreated, lastCreatedAt: r.report.lastCreatedAt }));
        note = r.savedToJob ? ` A copy is saved in job ${report.jobLabel}'s files as ${r.savedToJob.fileName}.` : "";
      } catch (e) { note = ` (${e instanceof Error ? e.message : "The copy for the job could not be saved."})`; }
      setMessage({ tone: "ok", text: `Created ${built.fileName} (${built.pages} pages) - check your Downloads folder.${note}` });
    } catch (e) {
      console.error(e);
      setMessage({ tone: "err", text: `Something went wrong building the report: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setCreating(false); }
  }

  async function duplicate() {
    await flush();
    try { const copy = await frApi<ReportDetail>(`/api/v1/failure-reports/${report.id}/duplicate`, { method: "POST" }); router.push(`/failure-reports/${copy.id}`); }
    catch (e) { setMessage({ tone: "err", text: e instanceof Error ? e.message : "Unable to copy the report." }); }
  }

  async function remove() {
    if (!(await confirm({ title: "Delete report?", message: "Delete this failure report and its photos? A copy already saved in the job's files stays there.", tone: "danger", confirmLabel: "Delete" }))) return;
    try { await frApi(`/api/v1/failure-reports/${report.id}`, { method: "DELETE" }); pending.current = {}; router.push("/failure-reports"); }
    catch (e) { setMessage({ tone: "err", text: e instanceof Error ? e.message : "Unable to delete the report." }); }
  }

  const input = (key: FieldKey) => {
    const listId = SUGGEST.has(key) && suggestions[key]?.length ? `fr-sg-${key}` : undefined;
    return (
      <label className="fr-field" key={key}>
        <span>{FIELD_LABELS[key]}{isFromJob(key) && <span className="fromjob" title="Pulled in from the linked job">from job</span>}{isEditedFromJob(key) && <span className="edited" title={`The job says: ${fromJob?.[key as JobFieldKey]}`}>changed from job</span>}</span>
        <input type={DATE_KEYS.has(key) ? "date" : "text"} value={fields[key]} disabled={readOnly} list={listId} onChange={(e) => setField(key, e.target.value)} placeholder={key === "job" ? "e.g. BRE1220" : undefined} />
        {listId && <datalist id={listId}>{suggestions[key].map((v) => <option key={v} value={v} />)}</datalist>}
      </label>
    );
  };

  const saveText = save === "saving" ? "Saving…" : save === "dirty" ? "● Not saved yet" : save === "error" ? "Not saved - will retry" : "All changes saved";

  return (
    <div className="fr-editor" style={themeVars}>
      <div className="fr-top">
        <Link href="/failure-reports" className="fr-icon-btn" aria-label="Back to Failure Reports" title="Failure Reports"><ArrowLeft size={15} /></Link>
        {/* eslint-disable-next-line @next/next/no-img-element -- the profile's logo, a data URL */}
        {profile?.logoData && <img className="fr-logo" src={profile.logoData} alt="" style={{ background: profile.logoDark ? `#${theme.dark}` : "transparent" }} />}
        <div className="fr-grow">
          <h1>Failure report{fields.job ? ` · ${fields.job}` : ""}</h1>
          <div className="fr-sub">{[[fields.make, fields.model].filter(Boolean).join(" "), fields.component, fields.client].filter(Boolean).join(" · ") || "New report"}{report.timesCreated > 0 ? ` · created ${report.timesCreated}×` : ""}</div>
        </div>
        {canEdit && <span className={`fr-save ${save === "dirty" ? "dirty" : save === "error" ? "err" : ""}`}>{saveText}</span>}
        {canEdit && <button type="button" className="quiet-button" onClick={() => void duplicate()} title="Start a new report as a copy of this one"><Copy size={14} /> Copy</button>}
        {canEdit && <button type="button" className="quiet-button" onClick={() => void remove()}><Trash2 size={14} /> Delete</button>}
        <button type="button" className="gold-button" onClick={() => void createReport()} disabled={creating || !!adding}>{creating ? <Loader2 className="spin" size={15} /> : <FileDown size={15} />} {creating ? "Building report…" : "Create Report"}</button>
      </div>

      {message && <div className={message.tone === "err" ? "inline-error" : "inline-success"} style={{ borderRadius: 10 }} role="status">{message.text} <button type="button" className="fr-link" onClick={() => setMessage(null)}>Dismiss</button></div>}

      {report.jobId ? (
        <div className="fr-jobstrip">
          <Link2 size={15} />
          <span className="fr-grow">Linked to job <strong>{report.jobLabel}</strong>. Its details were pulled in and every field can still be changed.</span>
          {canOpenJob && <Link className="fr-link" href={`/jobs/${encodeURIComponent(report.jobId)}`}>Open job</Link>}
          {canEdit && <button type="button" className="quiet-button" onClick={() => void refreshFromJob()}><RefreshCw size={14} /> Refresh from job</button>}
          {canEdit && <button type="button" className="quiet-button" onClick={() => void unlink()}><Unlink size={14} /> Unlink</button>}
        </div>
      ) : (
        <div className="fr-jobstrip none">
          <Link2 size={15} />
          <span className="fr-grow">Not linked to a job. Link one to pull its details in and keep a copy of the made report in the job&apos;s files.</span>
          {canEdit && <button type="button" className="quiet-button" onClick={() => setLinking(true)}>Link to a job</button>}
        </div>
      )}

      <section className="fr-card">
        <header><h2><span className="n">1</span>Job details</h2></header>
        <div className="fr-body">
          <div className="fr-bar">
            <label className="fr-field" style={{ minWidth: 260 }}>
              <span>Company for this report</span>
              <select value={profile?.id ?? ""} disabled={readOnly || profiles.length === 0} onChange={(e) => { setProfileId(e.target.value); queue({ profileId: e.target.value }); }}>
                {profiles.filter((p) => p.active || p.id === profileId).map((p) => <option key={p.id} value={p.id}>{p.name}{p.isDefault ? "  (default)" : ""}{p.active ? "" : "  (switched off)"}</option>)}
              </select>
            </label>
            <Link href="/failure-reports/profiles" className="fr-link" style={{ alignSelf: "end", marginBottom: 9 }}>Company profiles (logo, colours, details)</Link>
          </div>
          <div className="fr-grid">{DETAIL_KEYS.map(input)}</div>
          <div className="fr-subh">Warranty outcome</div>
          <div className="fr-wo" role="group" aria-label="Warranty outcome">
            {([["granted", "GRANTED", "g"], ["declined", "DECLINED", "d"], ["na", "N/A", "n"]] as Array<[WarrantyValue, string, string]>).map(([v, label, cls]) => (
              <button key={v} type="button" className={cls} aria-pressed={warranty === v} disabled={readOnly} onClick={() => { setWarranty(v); queue({ warranty: v }); }}>{label}</button>
            ))}
          </div>
          <div className="fr-subh">Document control</div>
          <div className="fr-grid4">{(["doc_no", "impl_date", "rev_no", "rev_date"] as FieldKey[]).map(input)}</div>
        </div>
      </section>

      <section className="fr-card">
        <header>
          <h2 className="fr-grow"><span className="n">2</span>Photos</h2>
          <span className="fr-sub">{photos.length ? `${photos.length} photo(s) · report will be ${pages} pages` : "No photos yet."}</span>
        </header>
        <div className="fr-body">
          {canEdit && (
            <div className={`fr-drop ${over ? "over" : ""}`} role="button" tabIndex={0} onClick={() => fileInput.current?.click()} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInput.current?.click(); }}
              onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(true); } }} onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files); }}>
              {adding ? <><Loader2 className="spin" size={18} /><b>{adding}</b></> : <><b>Drop photos here, or click to choose</b>You can pick many at once. Photo 1 goes on the cover, photo 2 on page 2 with the opening remark, the rest go on the photo pages in this order.</>}
            </div>
          )}
          <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files?.length) void addFiles(e.target.files); e.target.value = ""; }} />
          <div className="fr-bar">
            <label className="fr-field" style={{ width: 160 }}><span>Photos per page</span>
              <select value={perPage} disabled={readOnly} onChange={(e) => { const v = Number(e.target.value); setPerPage(v); queue({ perPage: v }); }}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</select>
            </label>
            <label className="fr-field" style={{ width: 260 }}><span>Heading beside photos on report</span>
              <input value={descHeading} maxLength={40} disabled={readOnly} list="fr-heading" onChange={(e) => { setDescHeading(e.target.value); queue({ descHeading: e.target.value }); }} />
              <datalist id="fr-heading"><option value="DESCRIPTION" /><option value="COMMENTS" /></datalist>
            </label>
          </div>
          <label className="fr-field"><span>Opening remark (page 2, above photo 2)</span>
            <textarea value={fields.intro} disabled={readOnly} onChange={(e) => setField("intro", e.target.value)} placeholder="e.g. Transmission was received in an assembled condition. Inspection will commence to assess its overall condition and determine damage/wear." />
          </label>
          <div className="fr-photos">
            {photos.map((p, i) => (
              <div key={p.id} style={{ display: "grid", gap: 8 }}>
                {i === 0 && <div className="fr-pagebreak">Page 1 – cover</div>}
                {i === 1 && <div className="fr-pagebreak">Page 2</div>}
                {i >= 2 && (i - 2) % perPage === 0 && <div className="fr-pagebreak">Page {3 + (i - 2) / perPage}</div>}
                <div className={`fr-ph ${dragFrom === i ? "dragging" : ""} ${dropAt === i && dragFrom !== i ? "dropt" : ""}`}
                  draggable={canEdit}
                  onDragStart={(e) => { if ((e.target as HTMLElement).closest("textarea")) { e.preventDefault(); return; } setDragFrom(i); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); }}
                  onDragEnd={() => { setDragFrom(null); setDropAt(null); }}
                  onDragOver={(e) => { if (dragFrom !== null) { e.preventDefault(); setDropAt(i); } }}
                  onDrop={(e) => { if (dragFrom !== null) { e.preventDefault(); e.stopPropagation(); void move(dragFrom, i); setDragFrom(null); setDropAt(null); } }}>
                  <div className="num" title={canEdit ? "Drag to reorder" : undefined}>{i + 1}{canEdit && <small>⠿ drag</small>}</div>
                  <button type="button" className="thumb" title={canEdit ? "Click to mark damage (arrows, circles, boxes, text)" : "View photo"} onClick={() => setEditing(p)}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- a stored photo, served by our own API */}
                    <img src={thumbs[p.id] || p.src} alt={`Photo ${i + 1}`} />
                    {p.marks.length > 0 && <span className="cnt">{p.marks.length} mark{p.marks.length > 1 ? "s" : ""}</span>}
                    {canEdit && <span className="mark">➜ Mark damage</span>}
                  </button>
                  <label className="fr-field">
                    <span>{descHeading ? descHeading.charAt(0) + descHeading.slice(1).toLowerCase() : "Description"} <span className="where">{photoRole(i, perPage)}{i === 0 ? " · prints under the cover photo" : i === 1 ? " · prints under the page 2 photo" : " · prints beside the photo"}</span></span>
                    <textarea value={p.caption} disabled={readOnly} onChange={(e) => setCaption(p, e.target.value)}
                      placeholder={i < 2 ? "Optional description for this photo (leave empty for none)." : "Describe this photo, e.g. Yoke sealing area worn. To be repaired."} />
                  </label>
                  {canEdit && (
                    <div className="acts">
                      <button type="button" className="fr-icon-btn" aria-label="Move up" title="Move up" disabled={i === 0} onClick={() => void move(i, i - 1)}><ArrowUp size={14} /></button>
                      <button type="button" className="fr-icon-btn" aria-label="Move down" title="Move down" disabled={i === photos.length - 1} onClick={() => void move(i, i + 1)}><ArrowDown size={14} /></button>
                      <button type="button" className="fr-icon-btn" aria-label="Mark damage" title="Mark damage" onClick={() => setEditing(p)}><PenLine size={14} /></button>
                      <button type="button" className="fr-icon-btn danger" aria-label="Delete photo" title="Delete photo" onClick={() => void removePhoto(i)}><Trash2 size={14} /></button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="fr-card">
        <header><h2><span className="n">3</span>Findings</h2></header>
        <div className="fr-body">
          <label className="fr-field"><span>Comments</span><textarea style={{ minHeight: 90 }} value={fields.comments} disabled={readOnly} onChange={(e) => setField("comments", e.target.value)} /></label>
          <div className="fr-lists">
            {LISTS.map(({ key, title }) => (
              <div className="fr-lst" key={key}>
                <h3>{title}</h3>
                <div className="items">
                  {lists[key].map((line, k) => (
                    <div className="item" key={k}>
                      <input value={line} disabled={readOnly} list={suggestions[key]?.length ? `fr-sg-${key}` : undefined} aria-label={`${title} line ${k + 1}`} onChange={(e) => setList(key, lists[key].map((v, j) => (j === k ? e.target.value : v)))} />
                      {canEdit && <button type="button" className="fr-icon-btn danger" aria-label="Remove line" onClick={() => setList(key, lists[key].filter((_, j) => j !== k))}><Trash2 size={13} /></button>}
                    </div>
                  ))}
                  {lists[key].length === 0 && <div className="fr-sub">Empty - prints as blank lines to fill in by hand.</div>}
                  {suggestions[key]?.length ? <datalist id={`fr-sg-${key}`}>{suggestions[key].map((v) => <option key={v} value={v} />)}</datalist> : null}
                </div>
                {canEdit && <button type="button" className="quiet-button add" onClick={() => setList(key, [...lists[key], ""])}>+ Add line</button>}
              </div>
            ))}
          </div>
          <p className="fr-sub" style={{ margin: 0 }}>Empty lists print as blank lines on the report so they can be filled in by hand.</p>
        </div>
      </section>

      {editing && <PhotoMarkEditor src={editing.src} width={editing.width} height={editing.height} marks={editing.marks} readOnly={readOnly} onCancel={() => setEditing(null)} onDone={(r) => void saveMarks(editing, r)} />}
      {linking && <JobPickerDialog title="Link to a job" intro="The job's details fill in any field that is still empty. Anything you have typed is kept - use Refresh from job afterwards to replace it." onClose={() => setLinking(false)} onPick={(job) => void pickJob(job)} />}
      {dialog}
    </div>
  );
}
