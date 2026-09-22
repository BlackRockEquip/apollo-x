"use client";

/* eslint-disable react-hooks/set-state-in-effect -- async user loading intentionally mirrors existing workspace patterns */
import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Pencil, Plus, Save, ShieldAlert, Trash2, X } from "lucide-react";

type ModuleOption = { moduleKey: string; label: string; category: string };
type UserRow = { id: string; email: string; displayName: string; active: boolean; membershipStatus: string; role: string; roleLabel: string; moduleLabels: string[]; moduleKeys?: string[] };
type EditorPayload = { availableModules: ModuleOption[]; roles: Array<{ role: string; label: string }>; editor: null | { membershipId: string; email: string; displayName: string; role: string; active: boolean; membershipStatus: string; selectedModuleKeys: string[] } };

type ListPayload = { users: UserRow[]; editor: EditorPayload };

// 2026-09-19 — user request: "under settings-users create tab headings:
// Add System Users, User Setup... User Setup will be where an admin can
// setup Mechanic Names that the corresponding fields in jobs pickup."
type MechanicRow = { id: string; name: string; active: boolean };

// 2026-09-22 — user request: "under Settings-Users-User Setup, add Sales
// Representative same as mechanic field." Same shape as MechanicRow.
type SalesRepresentativeRow = { id: string; name: string; active: boolean };

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

  const [tab, setTab] = useState<"add" | "setup">("add");
  const [mechanics, setMechanics] = useState<MechanicRow[]>([]);
  const [mechanicsLoading, setMechanicsLoading] = useState(true);
  const [mechanicSaving, setMechanicSaving] = useState(false);
  const [mechanicError, setMechanicError] = useState("");
  const [mechanicNotice, setMechanicNotice] = useState("");
  const [editingMechanicId, setEditingMechanicId] = useState<string | null>(null);
  const [mechanicForm, setMechanicForm] = useState({ name: "", active: true });

  const loadMechanics = useCallback(async () => {
    setMechanicsLoading(true);
    try {
      const response = await fetch("/api/v1/mechanics", { cache: "no-store" });
      const body: { mechanics: MechanicRow[] } = await response.json();
      if (!response.ok) throw new Error((body as never as { error?: { message?: string } }).error?.message || "Unable to load mechanics.");
      setMechanics(body.mechanics);
    } catch (e) { setMechanicError(e instanceof Error ? e.message : "Unable to load mechanics."); }
    finally { setMechanicsLoading(false); }
  }, []);

  useEffect(() => { void loadMechanics(); }, [loadMechanics]);

  function resetMechanicForm() {
    setEditingMechanicId(null);
    setMechanicNotice("");
    setMechanicForm({ name: "", active: true });
  }

  function startEditMechanic(mechanic: MechanicRow) {
    setEditingMechanicId(mechanic.id);
    setMechanicNotice("");
    setMechanicForm({ name: mechanic.name, active: mechanic.active });
  }

  async function saveMechanic() {
    setMechanicSaving(true); setMechanicError("");
    try {
      const wasEditingId = editingMechanicId;
      const response = await fetch(wasEditingId ? `/api/v1/mechanics/${wasEditingId}` : "/api/v1/mechanics", { method: wasEditingId ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(mechanicForm) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to save mechanic.");
      resetMechanicForm();
      setMechanicNotice(wasEditingId ? "Mechanic updated." : "Mechanic added.");
      await loadMechanics();
    } catch (e) { setMechanicError(e instanceof Error ? e.message : "Unable to save mechanic."); }
    finally { setMechanicSaving(false); }
  }

  async function removeMechanic(mechanic: MechanicRow) {
    if (!window.confirm(`Remove mechanic "${mechanic.name}"? Jobs currently assigned to them will keep their history but lose the assignment.`)) return;
    setMechanicSaving(true); setMechanicError(""); setMechanicNotice("");
    try {
      const response = await fetch(`/api/v1/mechanics/${mechanic.id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to remove mechanic.");
      if (editingMechanicId === mechanic.id) resetMechanicForm();
      setMechanicNotice("Mechanic removed.");
      await loadMechanics();
    } catch (e) { setMechanicError(e instanceof Error ? e.message : "Unable to remove mechanic."); }
    finally { setMechanicSaving(false); }
  }

  // 2026-09-22 — user request: "under Settings-Users-User Setup, add Sales
  // Representative same as mechanic field." Identical CRUD shape to the
  // Mechanic block above, against /api/v1/sales-representatives.
  const [salesRepresentatives, setSalesRepresentatives] = useState<SalesRepresentativeRow[]>([]);
  const [salesRepsLoading, setSalesRepsLoading] = useState(true);
  const [salesRepSaving, setSalesRepSaving] = useState(false);
  const [salesRepError, setSalesRepError] = useState("");
  const [salesRepNotice, setSalesRepNotice] = useState("");
  const [editingSalesRepId, setEditingSalesRepId] = useState<string | null>(null);
  const [salesRepForm, setSalesRepForm] = useState({ name: "", active: true });

  const loadSalesRepresentatives = useCallback(async () => {
    setSalesRepsLoading(true);
    try {
      const response = await fetch("/api/v1/sales-representatives", { cache: "no-store" });
      const body: { salesRepresentatives: SalesRepresentativeRow[] } = await response.json();
      if (!response.ok) throw new Error((body as never as { error?: { message?: string } }).error?.message || "Unable to load sales representatives.");
      setSalesRepresentatives(body.salesRepresentatives);
    } catch (e) { setSalesRepError(e instanceof Error ? e.message : "Unable to load sales representatives."); }
    finally { setSalesRepsLoading(false); }
  }, []);

  useEffect(() => { void loadSalesRepresentatives(); }, [loadSalesRepresentatives]);

  function resetSalesRepForm() {
    setEditingSalesRepId(null);
    setSalesRepNotice("");
    setSalesRepForm({ name: "", active: true });
  }

  function startEditSalesRep(salesRep: SalesRepresentativeRow) {
    setEditingSalesRepId(salesRep.id);
    setSalesRepNotice("");
    setSalesRepForm({ name: salesRep.name, active: salesRep.active });
  }

  async function saveSalesRep() {
    setSalesRepSaving(true); setSalesRepError("");
    try {
      const wasEditingId = editingSalesRepId;
      const response = await fetch(wasEditingId ? `/api/v1/sales-representatives/${wasEditingId}` : "/api/v1/sales-representatives", { method: wasEditingId ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(salesRepForm) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to save sales representative.");
      resetSalesRepForm();
      setSalesRepNotice(wasEditingId ? "Sales representative updated." : "Sales representative added.");
      await loadSalesRepresentatives();
    } catch (e) { setSalesRepError(e instanceof Error ? e.message : "Unable to save sales representative."); }
    finally { setSalesRepSaving(false); }
  }

  async function removeSalesRep(salesRep: SalesRepresentativeRow) {
    if (!window.confirm(`Remove sales representative "${salesRep.name}"? Jobs currently assigned to them will keep their history but lose the assignment.`)) return;
    setSalesRepSaving(true); setSalesRepError(""); setSalesRepNotice("");
    try {
      const response = await fetch(`/api/v1/sales-representatives/${salesRep.id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to remove sales representative.");
      if (editingSalesRepId === salesRep.id) resetSalesRepForm();
      setSalesRepNotice("Sales representative removed.");
      await loadSalesRepresentatives();
    } catch (e) { setSalesRepError(e instanceof Error ? e.message : "Unable to remove sales representative."); }
    finally { setSalesRepSaving(false); }
  }

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

  // 2026-09-19 — user request: "create tab headings: Add System Users, User
  // Setup." "Add System Users" is this same screen, reorganized: Add/Edit
  // user stays top-left, Tenant users moves back into the grid on the
  // right (its own follow-up request — it was pulled out full-width on
  // 2026-09-10 because Email/Allowed modules made it too cramped
  // half-width; both columns are dropped below, which is what makes
  // sharing the row workable again), and Module access moves below the
  // grid, full width. "User Setup" is new — a lightweight, admin-managed
  // list of Mechanic Names (see the Mechanic model comment in
  // schema.prisma) that the Job view's "Mechanic Strip"/"Mechanic
  // Assemble" dropdowns pick up, since real workshop mechanics often
  // don't have — and shouldn't need — a system login just to appear
  // there. Add/Edit user's own fields keep the .compact-form-fields
  // treatment (two classes so it reliably wins over the plain
  // .drawer-fields rules elsewhere, which — for reasons unrelated to this
  // page — aren't consistently sized) since they rendered far larger than
  // every other control in this app ("the add user fields... are way to
  // big").
  return <div>
    <div className="tab-strip">
      <button type="button" className={tab === "add" ? "active" : ""} onClick={() => setTab("add")}>Add System Users</button>
      <button type="button" className={tab === "setup" ? "active" : ""} onClick={() => setTab("setup")}>User Setup</button>
    </div>
    {tab === "add" ? <>
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
          <header><div><h2>Tenant users</h2></div></header>
          {loading ? <div className="table-state">Loading…</div> : <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Name</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><strong>{user.displayName}</strong></td><td>{user.roleLabel}</td><td>{user.active ? user.membershipStatus : "USER_DISABLED"}</td><td className="actions"><button type="button" className="table-action" onClick={() => void startEdit(user.id)}><Pencil size={14} /> Edit</button><button type="button" className="table-action" onClick={() => void resetSessions(user.id)}><KeyRound size={14} /> Reset</button></td></tr>)}{users.length === 0 && <tr><td colSpan={4} className="table-state compact-empty-state">No tenant users found.</td></tr>}</tbody></table></div>}
        </section>
      </div>
      <section className="detail-panel" style={{ marginTop: 16 }}>
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
      <div className="platform-inline-note"><ShieldAlert size={14} /> Backend entitlement checks remain authoritative. UI choices cannot grant unlicensed access.</div>
    </> : <>
      {mechanicError ? <div className="inline-error">{mechanicError}</div> : null}
      {mechanicNotice ? <div className="inline-success">{mechanicNotice}</div> : null}
      <div className="platform-grid">
        <section className="detail-panel">
          <header>
            <div><h2>{editingMechanicId ? "Edit mechanic" : "Add mechanic"}</h2><p className="muted small-line">Names added here populate the Mechanic Strip / Mechanic Assemble dropdowns on the Job view — no system login required.</p></div>
            <div className="header-actions">
              {editingMechanicId ? <button type="button" className="quiet-button" onClick={resetMechanicForm}><X size={14} /> Cancel</button> : null}
              <button type="button" className="gold-button" disabled={mechanicSaving || mechanicForm.name.trim().length < 1} onClick={() => void saveMechanic()}><Save size={14} /> Save</button>
            </div>
          </header>
          <div className="drawer-fields compact-form-fields">
            <label><span>Name</span><input value={mechanicForm.name} onChange={(e) => setMechanicForm((c) => ({ ...c, name: e.target.value }))} /></label>
            <label><span>Status</span><select value={mechanicForm.active ? "true" : "false"} onChange={(e) => setMechanicForm((c) => ({ ...c, active: e.target.value === "true" }))}><option value="true">Active</option><option value="false">Inactive</option></select></label>
          </div>
        </section>
        <section className="detail-panel">
          <header><div><h2>Mechanic names</h2></div></header>
          {mechanicsLoading ? <div className="table-state">Loading…</div> : <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Name</th><th>Status</th><th></th></tr></thead><tbody>{mechanics.map((mechanic) => <tr key={mechanic.id}><td><strong>{mechanic.name}</strong></td><td>{mechanic.active ? "Active" : "Inactive"}</td><td className="actions"><button type="button" className="table-action" onClick={() => startEditMechanic(mechanic)}><Pencil size={14} /> Edit</button><button type="button" className="table-action" onClick={() => void removeMechanic(mechanic)}><Trash2 size={14} /> Remove</button></td></tr>)}{mechanics.length === 0 && <tr><td colSpan={3} className="table-state compact-empty-state">No mechanics set up yet.</td></tr>}</tbody></table></div>}
        </section>
      </div>
      {/* 2026-09-22, user request: "add Sales Representative same as
          mechanic field." Identical layout to the Mechanic names panels
          above, its own grid row below them. */}
      {salesRepError ? <div className="inline-error">{salesRepError}</div> : null}
      {salesRepNotice ? <div className="inline-success">{salesRepNotice}</div> : null}
      <div className="platform-grid" style={{ marginTop: 16 }}>
        <section className="detail-panel">
          <header>
            <div><h2>{editingSalesRepId ? "Edit sales representative" : "Add sales representative"}</h2><p className="muted small-line">Names added here populate the Sales representative dropdown on the Job view.</p></div>
            <div className="header-actions">
              {editingSalesRepId ? <button type="button" className="quiet-button" onClick={resetSalesRepForm}><X size={14} /> Cancel</button> : null}
              <button type="button" className="gold-button" disabled={salesRepSaving || salesRepForm.name.trim().length < 1} onClick={() => void saveSalesRep()}><Save size={14} /> Save</button>
            </div>
          </header>
          <div className="drawer-fields compact-form-fields">
            <label><span>Name</span><input value={salesRepForm.name} onChange={(e) => setSalesRepForm((c) => ({ ...c, name: e.target.value }))} /></label>
            <label><span>Status</span><select value={salesRepForm.active ? "true" : "false"} onChange={(e) => setSalesRepForm((c) => ({ ...c, active: e.target.value === "true" }))}><option value="true">Active</option><option value="false">Inactive</option></select></label>
          </div>
        </section>
        <section className="detail-panel">
          <header><div><h2>Sales representative names</h2></div></header>
          {salesRepsLoading ? <div className="table-state">Loading…</div> : <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Name</th><th>Status</th><th></th></tr></thead><tbody>{salesRepresentatives.map((salesRep) => <tr key={salesRep.id}><td><strong>{salesRep.name}</strong></td><td>{salesRep.active ? "Active" : "Inactive"}</td><td className="actions"><button type="button" className="table-action" onClick={() => startEditSalesRep(salesRep)}><Pencil size={14} /> Edit</button><button type="button" className="table-action" onClick={() => void removeSalesRep(salesRep)}><Trash2 size={14} /> Remove</button></td></tr>)}{salesRepresentatives.length === 0 && <tr><td colSpan={3} className="table-state compact-empty-state">No sales representatives set up yet.</td></tr>}</tbody></table></div>}
        </section>
      </div>
    </>}
  </div>;
}
