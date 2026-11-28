"use client";

import "./tt.css";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { errText, readFileAsDataUrl, tt } from "./api";

type Settings = { settings: { certificatePrefix: string; defaultPassMark: number; defaultMaxAttempts: number; escalationDays: number; effectivenessDays: number; retentionYears: number }; fallbackPrefix: string; signer: { name: string; title: string; signature: string | null }; canEditSettings: boolean; hasCompanyLogo: boolean };
type Position = { id: string; name: string; requiredCourseIds: string[]; active: boolean; employees: number };
type Course = { id: string; title: string; code: string };

// Training settings (2026-11-28): positions and their required courses, module defaults (Company Admin), and each approver's signature.
export function SettingsWorkspace({ canManagePositions }: { canManagePositions: boolean }) {
  const { confirm, dialog } = useConfirmDialog();
  const [tab, setTab] = useState<"positions" | "defaults" | "signature">(canManagePositions ? "positions" : "signature");
  const [s, setS] = useState<Settings | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [edit, setEdit] = useState<{ id: string | null; name: string; requiredCourseIds: string[]; active: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const [st, ps] = await Promise.all([tt<Settings>("settings"), tt<{ items: Position[] }>("positions")]);
      setS(st); setPositions(ps.items);
      if (canManagePositions) setCourses((await tt<{ courses: Course[] }>("employees/editor")).courses);
    } catch (e) { setError(errText(e, "Unable to load settings.")); }
  }, [canManagePositions]);
  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t); }, [load]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setError(""); setNotice("");
    try { await fn(); setNotice(ok); await load(); } catch (e) { setError(errText(e, "Unable to save.")); } finally { setBusy(false); }
  }

  async function removePosition(p: Position) {
    if (!(await confirm({ title: "Remove position?", message: p.employees ? `${p.employees} employee${p.employees === 1 ? " has" : "s have"} this position, so it will be switched off instead of deleted.` : `Delete "${p.name}"?`, tone: "warning", confirmLabel: p.employees ? "Switch off" : "Delete" }))) return;
    await run(() => tt(`positions/${p.id}`, { method: "DELETE" }), "Position removed.");
  }

  async function pickSignature(file: File | undefined) {
    if (!file || !s) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setError("Choose a PNG, JPEG or WebP image of the signature."); return; }
    const dataUrl = await readFileAsDataUrl(file);
    await run(() => tt("settings/signer", { method: "PUT", body: { title: s.signer.title, signature: dataUrl } }), "Signature saved.");
  }

  if (!s) return error ? <div className="inline-error">{error}</div> : <div className="table-state"><Loader2 className="spin" size={20} /> Loading…</div>;
  const tabs = [...(canManagePositions ? [["positions", "Positions"]] : []), ["defaults", "Defaults"], ["signature", "My signature"]] as Array<[typeof tab, string]>;
  return (
    <div className="tt" style={{ maxWidth: 980 }}>
      <header className="page-header compact"><div><p className="eyebrow">Tech Training</p><h1>Training settings</h1><p>Certificates carry your company&apos;s own logo from Settings &gt; Company{s.hasCompanyLogo ? "" : " (none set yet)"}.</p></div></header>
      <div className="tt-tabs" role="tablist">{tabs.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>
      {error && <div className="inline-error">{error}</div>}
      {notice && <div className="tt-note ok">{notice}</div>}

      {tab === "positions" && (
        <section className="master-panel">
          <div className="master-toolbar"><span className="tt-sub tt-grow">Each position lists the courses people in it must complete (ISO 9001 7.2 a).</span><button type="button" className="gold-button" onClick={() => setEdit({ id: null, name: "", requiredCourseIds: [], active: true })}><Plus size={14} /> New position</button></div>
          <div className="data-table-wrap"><table className="data-table">
            <thead><tr><th>Position</th><th>Required courses</th><th>Employees</th><th></th></tr></thead>
            <tbody>
              {positions.map((p) => <tr key={p.id} className={p.active ? "" : "inactive"}><td><strong>{p.name}</strong>{!p.active && <span className="tt-pill" style={{ marginLeft: 6 }}>Off</span>}</td><td style={{ whiteSpace: "normal" }}>{p.requiredCourseIds.map((id) => courses.find((c) => c.id === id)?.title).filter(Boolean).join(", ") || <span className="tt-muted">None</span>}</td><td>{p.employees}</td><td><div className="tt-bar" style={{ flexWrap: "nowrap" }}><button type="button" className="quiet-button" onClick={() => setEdit({ id: p.id, name: p.name, requiredCourseIds: p.requiredCourseIds, active: p.active })}>Edit</button><button type="button" className="quiet-button" aria-label={`Remove ${p.name}`} onClick={() => void removePosition(p)}><Trash2 size={13} /></button></div></td></tr>)}
              {positions.length === 0 && <tr><td colSpan={4} className="table-state compact-empty-state">No positions yet. Add the job titles you train for (e.g. Hydraulic Fitter, Diesel Mechanic).</td></tr>}
            </tbody>
          </table></div>
        </section>
      )}

      {tab === "defaults" && (
        <section className="tt-card"><div className="tt-body">
          <div className="tt-grid3">
            <label className="tt-field">Certificate number prefix<input value={s.settings.certificatePrefix} placeholder={s.fallbackPrefix} disabled={!s.canEditSettings} onChange={(e) => setS({ ...s, settings: { ...s.settings, certificatePrefix: e.target.value } })} /><span className="hint">e.g. {(s.settings.certificatePrefix || s.fallbackPrefix).toUpperCase()}-HYD-3-20261127-AB12</span></label>
            <label className="tt-field">Default pass mark (%)<input type="number" min={1} max={100} value={s.settings.defaultPassMark} disabled={!s.canEditSettings} onChange={(e) => setS({ ...s, settings: { ...s.settings, defaultPassMark: Number(e.target.value) } })} /></label>
            <label className="tt-field">Default attempts<input type="number" min={1} max={20} value={s.settings.defaultMaxAttempts} disabled={!s.canEditSettings} onChange={(e) => setS({ ...s, settings: { ...s.settings, defaultMaxAttempts: Number(e.target.value) } })} /></label>
            <label className="tt-field">Escalate approvals after (working days)<input type="number" min={1} max={60} value={s.settings.escalationDays} disabled={!s.canEditSettings} onChange={(e) => setS({ ...s, settings: { ...s.settings, escalationDays: Number(e.target.value) } })} /></label>
            <label className="tt-field">Effectiveness review after (days)<input type="number" min={7} max={365} value={s.settings.effectivenessDays} disabled={!s.canEditSettings} onChange={(e) => setS({ ...s, settings: { ...s.settings, effectivenessDays: Number(e.target.value) } })} /></label>
            <label className="tt-field">Keep records for (years)<input type="number" min={10} max={50} value={s.settings.retentionYears} disabled={!s.canEditSettings} onChange={(e) => setS({ ...s, settings: { ...s.settings, retentionYears: Number(e.target.value) } })} /></label>
          </div>
          {s.canEditSettings ? <div><button type="button" className="gold-button" disabled={busy} onClick={() => void run(() => tt("settings", { method: "PUT", body: s.settings }), "Settings saved.")}>Save settings</button></div> : <span className="tt-sub">Only a Company Admin can change these.</span>}
        </div></section>
      )}

      {tab === "signature" && (
        <section className="tt-card"><div className="tt-body">
          <p className="tt-sub" style={{ margin: 0 }}>Your title and signature are printed on the certificates you approve. Each certificate keeps the signature it was approved with.</p>
          <div className="tt-grid2">
            <label className="tt-field">Name<input value={s.signer.name} disabled /></label>
            <label className="tt-field">Title<input value={s.signer.title} placeholder="e.g. Workshop Manager" onChange={(e) => setS({ ...s, signer: { ...s.signer, title: e.target.value } })} /></label>
          </div>
          <div className="tt-bar">
            {/* eslint-disable-next-line @next/next/no-img-element -- the approver's own signature image */}
            {s.signer.signature ? <img src={s.signer.signature} alt="Your signature" style={{ maxHeight: 80, maxWidth: 280, border: "1px solid #e2e6ec", borderRadius: 6, background: "#fff", padding: 6 }} /> : <span className="tt-sub">No signature image yet.</span>}
            <label className="quiet-button" style={{ cursor: "pointer" }}>Upload signature<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void pickSignature(e.target.files?.[0])} /></label>
            {s.signer.signature && <button type="button" className="quiet-button" onClick={() => void run(() => tt("settings/signer", { method: "PUT", body: { title: s.signer.title, signature: null } }), "Signature removed.")}>Remove</button>}
          </div>
          <div><button type="button" className="gold-button" disabled={busy} onClick={() => void run(() => tt("settings/signer", { method: "PUT", body: { title: s.signer.title } }), "Saved.")}>Save title</button></div>
        </div></section>
      )}

      {edit && (
        <div className="tt-backdrop center" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setEdit(null); }}>
          <div className="tt-dialog" role="dialog" aria-modal="true" aria-label="Position">
            <header><h2>{edit.id ? "Edit position" : "New position"}</h2><button type="button" className="tt-x" aria-label="Close" onClick={() => setEdit(null)}>×</button></header>
            <div className="tt-body">
              <label className="tt-field">Position name<input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus /></label>
              <strong style={{ fontSize: 12.5 }}>Required courses</strong>
              <div style={{ display: "grid", gap: 4, maxHeight: 280, overflow: "auto" }}>
                {courses.map((c) => <label key={c.id} className="tt-check"><input type="checkbox" checked={edit.requiredCourseIds.includes(c.id)} onChange={(e) => setEdit({ ...edit, requiredCourseIds: e.target.checked ? [...edit.requiredCourseIds, c.id] : edit.requiredCourseIds.filter((x) => x !== c.id) })} /><span>{c.title} <small>{c.code}</small></span></label>)}
                {!courses.length && <span className="tt-sub">No published courses yet.</span>}
              </div>
              {edit.id && <label className="tt-check"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /><span>Position in use</span></label>}
            </div>
            <footer><button type="button" className="quiet-button" onClick={() => setEdit(null)}>Cancel</button><button type="button" className="gold-button" disabled={busy || !edit.name.trim()} onClick={() => void run(async () => { await tt(edit.id ? `positions/${edit.id}` : "positions", { method: edit.id ? "PUT" : "POST", body: { name: edit.name, requiredCourseIds: edit.requiredCourseIds, active: edit.active } }); setEdit(null); }, "Position saved.")}>Save</button></footer>
          </div>
        </div>
      )}
      {dialog}
    </div>
  );
}
