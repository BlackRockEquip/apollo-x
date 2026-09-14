"use client";

/* eslint-disable react-hooks/set-state-in-effect -- async user loading intentionally mirrors existing workspace patterns */
import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Pencil, Plus, Save, ShieldAlert, X } from "lucide-react";

type ModuleOption = { moduleKey: string; label: string; category: string };
type UserRow = { id: string; email: string; displayName: string; active: boolean; membershipStatus: string; role: string; roleLabel: string; moduleLabels: string[]; moduleKeys?: string[] };
type EditorPayload = { availableModules: ModuleOption[]; roles: Array<{ role: string; label: string }>; editor: null | { membershipId: string; email: string; displayName: string; role: string; active: boolean; membershipStatus: string; selectedModuleKeys: string[] } };

type ListPayload = { users: UserRow[]; editor: EditorPayload };

// 2026-09-10 — split out of what used to be users/page.tsx itself (a
// "use client" page.tsx can't be an async server component, so it couldn't
// fetch the RequestContext the new shared SettingsTabNav needs — see the
// settings-nav.ts header comment, and Users moving here in the first place
// per the user's request to fold the old standalone "Administration"
// sidebar group into Settings). Same logic as before, unchanged; the new
// page.tsx is a thin async server wrapper that renders the tab bar above
// this component. The "Add User" action that used to live in a page-header
// is now its own small action bar at the top of this component instead.
export function UsersWorkspace() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [editorSeed, setEditorSeed] = useState<EditorPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // 2026-09-10 — resetSessions previously gave no feedback at all: clicking
  // "Reset" (after confirming) either silently succeeded or silently threw
  // an error only ever surfaced via `error`, so a successful reset looked
  // exactly like the button doing nothing. This surfaces that success too.
  const [notice, setNotice] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", displayName: "", role: "USER", password: "", active: true, membershipStatus: "ACTIVE", selectedModuleKeys: [] as string[] });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/v1/users", { cache: "no-store" });
      const body: ListPayload = await response.json();
      if (!response.ok) throw new Error((body as never as { error?: { message?: string } }).error?.message || "Unable to load users.");
      setUsers(body.users);
      setEditorSeed(body.editor);
      if (!editingId) setForm((current) => ({ ...current, selectedModuleKeys: body.editor.editor?.selectedModuleKeys ?? body.editor.availableModules.slice(0, 2).map((m) => m.moduleKey) }));
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load users."); }
    finally { setLoading(false); }
  }, [editingId]);

  useEffect(() => { void load(); }, [load]);

  async function startEdit(id: string) {
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/v1/users/${id}`, { cache: "no-store" });
      const body: EditorPayload = await response.json();
      if (!response.ok) throw new Error((body as never as { error?: { message?: string } }).error?.message || "Unable to load user.");
      setEditingId(id);
      setEditorSeed(body);
      if (body.editor) setForm({ email: body.editor.email, displayName: body.editor.displayName, role: body.editor.role, password: "", active: body.editor.active, membershipStatus: body.editor.membershipStatus, selectedModuleKeys: body.editor.selectedModuleKeys });
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load user."); }
    finally { setSaving(false); }
  }

  function resetForm() {
    setEditingId(null);
    setNotice("");
    setForm({ email: "", displayName: "", role: "USER", password: "", active: true, membershipStatus: "ACTIVE", selectedModuleKeys: editorSeed?.availableModules.slice(0, 2).map((m) => m.moduleKey) ?? [] });
  }

  // 2026-09-14 — "module selection keeps jumping around not staying on the
  // modules when save is clicked": this used to call resetForm()
  // unconditionally right after every successful save, whether adding a
  // new user or editing an existing one. resetForm() sets
  // selectedModuleKeys back to a generic default (the company's first two
  // available modules) — so the moment an admin edited someone's modules
  // and hit Save, the picker visibly snapped to a different selection,
  // even though the save itself had already gone through correctly with
  // what was actually chosen. Now an edit re-syncs the form from the
  // server's confirmed state (via startEdit) instead of resetting to
  // defaults — Add still resets to a blank form afterwards, since that's
  // the expected next step there.
  async function saveUser() {
    setSaving(true); setError("");
    try {
      const payload = { ...form, moduleKeys: form.selectedModuleKeys };
      const wasEditingId = editingId;
      const response = await fetch(wasEditingId ? `/api/v1/users/${wasEditingId}` : "/api/v1/users", { method: wasEditingId ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to save user.");
      if (wasEditingId) {
        await startEdit(wasEditingId);
        setNotice("User updated.");
      } else {
        resetForm();
        setNotice("User added.");
      }
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save user."); }
    finally { setSaving(false); }
  }

  async function resetSessions(id: string) {
    if (!window.confirm("Reset this user's active sessions?")) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/v1/users/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to reset sessions.");
      setNotice("Sessions reset — this user will need to sign in again.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to reset sessions."); }
    finally { setSaving(false); }
  }

  const groupedModules = useMemo(() => {
    const groups = new Map<string, ModuleOption[]>();
    for (const row of editorSeed?.availableModules ?? []) {
      if (!groups.has(row.category)) groups.set(row.category, []);
      groups.get(row.category)!.push(row);
    }
    return Array.from(groups.entries());
  }, [editorSeed]);

  // 2026-09-10 — revised per follow-up feedback: having Tenant users stacked
  // under Add/Edit user in a half-width left column made that table too
  // cramped (its columns — Name/Email/Role/Status/Allowed modules/Actions —
  // need real width). Tenant users now sits full-width below the Add/Edit
  // user + Module access row instead of sharing a column with either of
  // them. Add/Edit user's own fields also get the new .compact-form-fields
  // treatment below (two classes so it reliably wins over the plain
  // .drawer-fields rules elsewhere, which — for reasons unrelated to this
  // page — aren't consistently sized) since they rendered far larger than
  // every other control in this app ("the add user fields... are way to
  // big").
  return <div>
    <div className="header-actions" style={{ marginBottom: 12 }}><button type="button" className="gold-button" onClick={resetForm}><Plus size={14} /> Add User</button></div>
    {error ? <div className="inline-error">{error}</div> : null}
    {notice ? <div className="inline-success">{notice}</div> : null}
    <div className="platform-grid">
      <section className="detail-panel">
        <header>
          <div><h2>{editingId ? "Edit user" : "Add user"}</h2></div>
          <div className="header-actions">
            {editingId ? <button type="button" className="quiet-button" onClick={resetForm}><X size={14} /> Cancel</button> : null}
            <button type="button" className="gold-button" disabled={saving || form.email.trim().length < 5 || form.displayName.trim().length < 2 || (!editingId && form.password.length < 8)} onClick={() => void saveUser()}><Save size={14} /> Save</button>
          </div>
        </header>
        <div className="drawer-fields compact-form-fields">
          <label><span>Name</span><input value={form.displayName} onChange={(e) => setForm((c) => ({ ...c, displayName: e.target.value }))} /></label>
          <label><span>Email</span><input value={form.email} disabled={Boolean(editingId)} onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))} /></label>
          <label><span>Role</span><select value={form.role} onChange={(e) => setForm((c) => ({ ...c, role: e.target.value }))}>{editorSeed?.roles.map((role) => <option key={role.role} value={role.role}>{role.label}</option>)}</select></label>
          <label><span>Password {editingId ? "(leave blank to keep)" : ""}</span><input type="password" value={form.password} onChange={(e) => setForm((c) => ({ ...c, password: e.target.value }))} /></label>
          <label><span>User active</span><select value={form.active ? "true" : "false"} onChange={(e) => setForm((c) => ({ ...c, active: e.target.value === "true" }))}><option value="true">Active</option><option value="false">Inactive</option></select></label>
          <label><span>Membership status</span><select value={form.membershipStatus} onChange={(e) => setForm((c) => ({ ...c, membershipStatus: e.target.value }))}><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="ENDED">Ended</option></select></label>
        </div>
      </section>
      <section className="detail-panel">
        {/* 2026-09-10 — two follow-up fixes:
            1. availableModules (and therefore groupedModules) was already
               filtered server-side to the company's *entitled* modules
               (see companyEntitledModules() in users/service.ts), so a
               company with no active module entitlements always rendered
               this panel with nothing in it — just a blank box under the
               heading, with no explanation. That's now called out
               explicitly below instead of silently showing nothing.
            2. Clicking a pill here only ever edits local form state
               (form.selectedModuleKeys); it has no effect — and nothing
               to attach itself to — until Save is pressed against a
               specific Add/Edit user target. Reported as "the error it
               throws when clicking on modules is not identifiable",
               which is really just that ambiguity: a note now says so
               up front instead of letting people click around and get a
               confusing save failure. */}
        <header><div><h2>Module access</h2><p>Only entitled modules are available here.</p><p className="muted small-line">Add a user or edit an existing user above first — selections here apply to that user only and are saved together with it.</p></div></header>
        {groupedModules.length === 0
          ? <p className="table-state compact-empty-state">No modules are enabled for this company yet. Ask your Apollo X administrator to add module licensing before users can be granted access.</p>
          : <div className="module-picker-groups">{groupedModules.map(([category, items]) => <section key={category} className="module-picker-group"><h3>{category}</h3><div className="module-pill-grid">{items.map((item) => { const selected = form.selectedModuleKeys.includes(item.moduleKey); return <button key={item.moduleKey} type="button" className={selected ? "module-pill selected" : "module-pill"} onClick={() => setForm((current) => ({ ...current, selectedModuleKeys: selected ? current.selectedModuleKeys.filter((key) => key !== item.moduleKey) : [...current.selectedModuleKeys, item.moduleKey] }))}><span>{selected ? "✓" : "○"}</span><strong>{item.label}</strong></button>; })}</div></section>)}</div>}
      </section>
    </div>
    <section className="detail-panel" style={{ marginTop: 16 }}>
      <header><div><h2>Tenant users</h2></div></header>
      {loading ? <div className="table-state">Loading…</div> : <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Allowed modules</th><th></th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><strong>{user.displayName}</strong></td><td>{user.email}</td><td>{user.roleLabel}</td><td>{user.active ? user.membershipStatus : "USER_DISABLED"}</td><td>{user.moduleLabels.join(" · ")}</td><td className="actions"><button type="button" className="table-action" onClick={() => void startEdit(user.id)}><Pencil size={14} /> Edit</button><button type="button" className="table-action" onClick={() => void resetSessions(user.id)}><KeyRound size={14} /> Reset</button></td></tr>)}{users.length === 0 && <tr><td colSpan={6} className="table-state compact-empty-state">No tenant users found.</td></tr>}</tbody></table></div>}
    </section>
    <div className="platform-inline-note"><ShieldAlert size={14} /> Backend entitlement checks remain authoritative. UI choices cannot grant unlicensed access.</div>
  </div>;
}
