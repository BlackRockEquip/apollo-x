"use client";

import "./tt.css";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookPlus, Loader2, Pencil, Plus, Search, UserCheck, UserX } from "lucide-react";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { checkSaIdNumber } from "@/lib/training/model";
import { errText, initials, STATUS_LABEL, statusTone, tt } from "./api";

type Row = { id: string; name: string; firstName: string; surname: string; email: string; employeeNo: string; idNumber: string; position: string; positionId: string | null; managerName: string; status: string; hasLogin: boolean; busy: number; waiting: number; certificates: number; overdue: number; required: number; requiredDone: number; current: string; currentStatus: string | null };
type ListData = { items: Row[]; kpis: { active: number; busy: number; waiting: number; noLogin: number }; showIdNumbers: boolean };
type Editor = { positions: Array<{ id: string; name: string; requiredCourseIds: string[] }>; courses: Array<{ id: string; title: string; code: string }>; users: Array<{ userId: string; name: string; email: string; role: string; linkedEmployeeId: string | null }>; approvers: Array<{ userId: string; name: string; role: string }>; canCreateLogin: boolean };
type Form = { id: string | null; firstName: string; surname: string; idNumber: string; email: string; positionId: string; employeeNo: string; managerUserId: string; userId: string; notes: string; createLogin: boolean; enrolRequired: boolean; dueDays: number };

const blank: Form = { id: null, firstName: "", surname: "", idNumber: "", email: "", positionId: "", employeeNo: "", managerUserId: "", userId: "", notes: "", createLogin: false, enrolRequired: true, dueDays: 30 };

// Employees (2026-11-28): the training register. Company Admins create and change profiles: Name, Surname, ID number, Position, Email.
export function EmployeesWorkspace({ canEdit, canAssign }: { canEdit: boolean; canAssign: boolean }) {
  const { confirm, dialog } = useConfirmDialog();
  const [data, setData] = useState<ListData | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [positionId, setPositionId] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [assign, setAssign] = useState<{ ids: string[]; courseIds: string[]; due: string } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try { setData(await tt<ListData>(`employees?q=${encodeURIComponent(query)}&status=${status}&positionId=${positionId}`)); setError(""); }
    catch (e) { setError(errText(e, "Unable to load employees.")); }
  }, [query, status, positionId]);
  useEffect(() => { const t = setTimeout(() => void load(), query ? 250 : 0); return () => clearTimeout(t); }, [load, query]);
  useEffect(() => { if (canEdit || canAssign) tt<Editor>("employees/editor").then(setEditor).catch(() => {}); }, [canEdit, canAssign]);

  const idCheck = useMemo(() => (form && form.idNumber.replace(/\s/g, "").length >= 6 ? checkSaIdNumber(form.idNumber) : null), [form]);
  const position = editor?.positions.find((p) => p.id === form?.positionId);

  async function openEdit(row: Row | null) {
    setFormError("");
    if (!row) { setForm({ ...blank }); return; }
    try {
      const e = await tt<{ firstName: string; surname: string; idNumber: string; email: string; positionId: string | null; employeeNo: string; managerUserId: string | null; userId: string | null; notes: string }>(`employees/${row.id}`);
      setForm({ ...blank, id: row.id, firstName: e.firstName, surname: e.surname, idNumber: e.idNumber, email: e.email, positionId: e.positionId ?? "", employeeNo: e.employeeNo, managerUserId: e.managerUserId ?? "", userId: e.userId ?? "", notes: e.notes, enrolRequired: false });
    } catch (err) { setError(errText(err, "Unable to open the profile.")); }
  }

  async function save() {
    if (!form) return;
    setBusy(true); setFormError("");
    try {
      const body = { ...form, managerUserId: form.managerUserId || null, userId: form.userId || null };
      const r = form.id ? await tt<{ enrolled: number }>(`employees/${form.id}`, { method: "PUT", body }) : await tt<{ enrolled: number }>("employees", { method: "POST", body });
      setNotice(`${form.firstName} ${form.surname} saved${r.enrolled ? `, enrolled in ${r.enrolled} required course${r.enrolled === 1 ? "" : "s"}` : ""}.`);
      setForm(null); await load(); tt<Editor>("employees/editor").then(setEditor).catch(() => {});
    } catch (e) { setFormError(errText(e, "Unable to save.")); }
    finally { setBusy(false); }
  }

  async function toggleStatus(row: Row) {
    const deactivate = row.status === "ACTIVE";
    const ok = await confirm({ title: deactivate ? "Deactivate employee?" : "Reactivate employee?", message: deactivate ? `${row.name} leaves the active register. Their training records and certificates are kept for the retention period.` : `${row.name} goes back on the active register.`, tone: deactivate ? "warning" : "neutral", confirmLabel: deactivate ? "Deactivate" : "Reactivate" });
    if (!ok) return;
    try { await tt(`employees/${row.id}/status`, { method: "POST", body: { status: deactivate ? "INACTIVE" : "ACTIVE" } }); await load(); }
    catch (e) { setError(errText(e, "Unable to change the status.")); }
  }

  async function doAssign() {
    if (!assign) return;
    setBusy(true);
    try { const r = await tt<{ added: number }>("assign", { method: "POST", body: { employeeIds: assign.ids, courseIds: assign.courseIds, dueDate: assign.due || null } }); setNotice(`${r.added} course assignment${r.added === 1 ? "" : "s"} added.`); setAssign(null); setSelected([]); await load(); }
    catch (e) { setFormError(errText(e, "Unable to assign.")); }
    finally { setBusy(false); }
  }

  const set = (patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f));

  return (
    <div className="tt">
      <header className="page-header compact">
        <div><p className="eyebrow">Tech Training · Company Admin</p><h1>Employees</h1><p>The training register. Only Company Admins can add or change an employee profile.</p></div>
        <div className="tt-bar">
          {canAssign && selected.length > 0 && <button type="button" className="quiet-button" onClick={() => { setFormError(""); setAssign({ ids: selected, courseIds: [], due: "" }); }}><BookPlus size={14} /> Assign courses ({selected.length})</button>}
          {canEdit && <button type="button" className="gold-button" onClick={() => void openEdit(null)}><Plus size={15} /> New employee</button>}
        </div>
      </header>
      {error && <div className="inline-error">{error}</div>}
      {notice && <div className="tt-note ok">{notice}</div>}
      {data && (
        <div className="tt-kpis">
          <div className="tt-kpi"><b>{data.kpis.active}</b><span>Active employees</span></div>
          <div className="tt-kpi"><b>{data.kpis.busy}</b><span>Busy with a course</span></div>
          <div className={`tt-kpi ${data.kpis.waiting ? "warn" : ""}`}><b>{data.kpis.waiting}</b><span>Certificates awaiting approval</span></div>
          <div className="tt-kpi"><b>{data.kpis.noLogin}</b><span>Without a Flo X login</span></div>
        </div>
      )}
      <section className="master-panel">
        <div className="master-toolbar">
          <label className="search-control"><Search size={15} /><input aria-label="Search employees" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, ID number, email, position" /></label>
          <label className="tt-field" style={{ minWidth: 160 }}><select aria-label="Position" value={positionId} onChange={(e) => setPositionId(e.target.value)}><option value="">All positions</option>{editor?.positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label className="tt-field" style={{ minWidth: 120 }}><select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="ALL">All</option></select></label>
        </div>
        {!data ? <div className="table-state"><Loader2 className="spin" size={20} /> Loading…</div> : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr>{canAssign && <th style={{ width: 32 }}><input type="checkbox" aria-label="Select all" checked={selected.length > 0 && selected.length === data.items.length} onChange={(e) => setSelected(e.target.checked ? data.items.map((i) => i.id) : [])} /></th>}<th>Employee</th><th>ID number</th><th>Position</th><th>Required</th><th>Training now</th><th>Certificates</th><th>Login</th><th>Status</th><th style={{ width: 90 }}></th></tr></thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id} className={r.status === "INACTIVE" ? "inactive" : ""}>
                    {canAssign && <td><input type="checkbox" aria-label={`Select ${r.name}`} checked={selected.includes(r.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, r.id] : s.filter((x) => x !== r.id)))} /></td>}
                    <td><div className="tt-bar" style={{ flexWrap: "nowrap" }}><span style={{ width: 30, height: 30, borderRadius: "50%", background: "#0f1b2d", color: "#fff", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>{initials(r.name)}</span><div><Link className="tt-link" style={{ color: "#172033" }} href={`/tech-training/records/${r.id}`}>{r.name}</Link><div className="tt-sub">{r.email}{r.employeeNo ? ` · ${r.employeeNo}` : ""}</div></div></div></td>
                    <td className="tt-mono">{r.idNumber}</td>
                    <td>{r.position || <span className="tt-muted">—</span>}{r.managerName && <div className="tt-sub">Manager: {r.managerName}</div>}</td>
                    <td>{r.required ? <><span className="tt-mono">{r.requiredDone}/{r.required}</span><div className={`tt-meter ${r.requiredDone === r.required ? "done" : ""}`} style={{ width: 90, marginTop: 4 }}><i style={{ width: `${Math.round((100 * r.requiredDone) / r.required)}%` }} /></div></> : <span className="tt-muted">—</span>}</td>
                    <td>{r.current ? <>{r.current}<div>{r.currentStatus && <span className={`tt-pill ${statusTone(r.currentStatus)}`}>{STATUS_LABEL[r.currentStatus]}</span>}{r.overdue > 0 && <span className="tt-pill bad" style={{ marginLeft: 4 }}>{r.overdue} overdue</span>}</div></> : <span className="tt-muted">—</span>}</td>
                    <td>{r.certificates}</td>
                    <td>{r.hasLogin ? "Linked" : <span className="tt-muted">None</span>}</td>
                    <td><span className={`tt-pill ${statusTone(r.status)}`}>{STATUS_LABEL[r.status]}</span></td>
                    <td><div className="tt-bar" style={{ gap: 4, flexWrap: "nowrap" }}>
                      {canEdit && <button type="button" className="quiet-button" aria-label={`Edit ${r.name}`} title="Edit" onClick={() => void openEdit(r)}><Pencil size={13} /></button>}
                      {canEdit && <button type="button" className="quiet-button" aria-label={r.status === "ACTIVE" ? `Deactivate ${r.name}` : `Reactivate ${r.name}`} title={r.status === "ACTIVE" ? "Deactivate" : "Reactivate"} onClick={() => void toggleStatus(r)}>{r.status === "ACTIVE" ? <UserX size={13} /> : <UserCheck size={13} />}</button>}
                    </div></td>
                  </tr>
                ))}
                {data.items.length === 0 && <tr><td colSpan={10} className="table-state compact-empty-state">{query ? "No employees match." : canEdit ? "No employees yet. Add the first one with New employee (add positions under Training settings first)." : "No employees yet."}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="tt-sub">{data?.showIdNumbers ? "ID numbers are shown in full to Company Admins only (POPIA)." : "ID numbers are masked (POPIA)."} Deactivated employees stay on record.</p>

      {form && (
        <div className="tt-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setForm(null); }}>
          <aside className="tt-drawer" role="dialog" aria-modal="true" aria-label="Employee profile">
            <header><div><p className="eyebrow" style={{ margin: 0 }}>{form.id ? "Edit employee" : "New employee"}</p><h2>Employee profile</h2></div><button type="button" className="tt-x" aria-label="Close" onClick={() => setForm(null)}>×</button></header>
            <div className="tt-body tt-grid2">
              <label className="tt-field">Name *<input value={form.firstName} onChange={(e) => set({ firstName: e.target.value })} autoFocus /></label>
              <label className="tt-field">Surname *<input value={form.surname} onChange={(e) => set({ surname: e.target.value })} /></label>
              <label className="tt-field full">ID number *<input className="tt-mono" value={form.idNumber} onChange={(e) => set({ idNumber: e.target.value })} inputMode="numeric" maxLength={16} />
                {idCheck && <span className={idCheck.valid ? "ok" : "bad"}>{idCheck.valid ? `✓ Valid SA ID · born ${idCheck.birthDate}` : idCheck.message}</span>}</label>
              <label className="tt-field full">Position *<select value={form.positionId} onChange={(e) => set({ positionId: e.target.value })}><option value="">Choose…</option>{editor?.positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                <span className="hint">{position ? (position.requiredCourseIds.length ? `Required training: ${position.requiredCourseIds.map((id) => editor?.courses.find((c) => c.id === id)?.title).filter(Boolean).join(", ")}` : "This position has no required courses yet.") : editor && !editor.positions.length ? "Add positions under Tech Training > Training settings." : ""}</span></label>
              <label className="tt-field full">Email address *<input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} /></label>
              <label className="tt-field">Employee number<input value={form.employeeNo} onChange={(e) => set({ employeeNo: e.target.value })} /></label>
              <label className="tt-field">Manager (approves certificates)<select value={form.managerUserId} onChange={(e) => set({ managerUserId: e.target.value })}><option value="">Any manager or Company Admin</option>{editor?.approvers.map((a) => <option key={a.userId} value={a.userId}>{a.name}</option>)}</select></label>
              <label className="tt-field full">Flo X login<select value={form.userId} onChange={(e) => set({ userId: e.target.value, createLogin: false })}><option value="">Not linked</option>{editor?.users.filter((u) => !u.linkedEmployeeId || u.linkedEmployeeId === form.id).map((u) => <option key={u.userId} value={u.userId}>{u.name} · {u.email}</option>)}</select><span className="hint">Link the person&apos;s Flo X login so they can take courses.</span></label>
              {!form.userId && !form.id && editor?.canCreateLogin && <label className="tt-check full"><input type="checkbox" checked={form.createLogin} onChange={(e) => set({ createLogin: e.target.checked })} /><span><strong>Create a Flo X login (training only)</strong><small>A User login with only Tech Training switched on. They set a password with Forgot password on the sign-in page.</small></span></label>}
              <label className="tt-check full"><input type="checkbox" checked={form.enrolRequired} onChange={(e) => set({ enrolRequired: e.target.checked })} /><span><strong>Enrol in the required training for this position</strong><small>Due <input type="number" min={1} max={365} value={form.dueDays} onChange={(e) => set({ dueDays: Number(e.target.value) || 30 })} style={{ width: 60 }} aria-label="Days until due" /> days from today. Courses already assigned are left as they are.</small></span></label>
              <label className="tt-field full">Notes<textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} /></label>
              {formError && <div className="inline-error full">{formError}</div>}
            </div>
            <footer><span className="tt-sub tt-grow">Saved to the audit log with your name and the time.</span><button type="button" className="quiet-button" onClick={() => setForm(null)}>Cancel</button><button type="button" className="gold-button" disabled={busy} onClick={() => void save()}>{busy ? <Loader2 className="spin" size={14} /> : null} Save employee</button></footer>
          </aside>
        </div>
      )}

      {assign && editor && (
        <div className="tt-backdrop center" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setAssign(null); }}>
          <div className="tt-dialog" role="dialog" aria-modal="true" aria-label="Assign courses">
            <header><h2>Assign courses to {assign.ids.length} employee{assign.ids.length === 1 ? "" : "s"}</h2><button type="button" className="tt-x" aria-label="Close" onClick={() => setAssign(null)}>×</button></header>
            <div className="tt-body">
              <div style={{ display: "grid", gap: 4, maxHeight: 300, overflow: "auto" }}>
                {editor.courses.map((c) => <label key={c.id} className="tt-check"><input type="checkbox" checked={assign.courseIds.includes(c.id)} onChange={(e) => setAssign({ ...assign, courseIds: e.target.checked ? [...assign.courseIds, c.id] : assign.courseIds.filter((x) => x !== c.id) })} /><span>{c.title} <small>{c.code}</small></span></label>)}
                {!editor.courses.length && <span className="tt-sub">No published courses yet.</span>}
              </div>
              <label className="tt-field">Due date (optional)<input type="date" value={assign.due} onChange={(e) => setAssign({ ...assign, due: e.target.value })} /></label>
              {formError && <div className="inline-error">{formError}</div>}
            </div>
            <footer><button type="button" className="quiet-button" onClick={() => setAssign(null)}>Cancel</button><button type="button" className="gold-button" disabled={busy || !assign.courseIds.length} onClick={() => void doAssign()}>Assign</button></footer>
          </div>
        </div>
      )}
      {dialog}
    </div>
  );
}
