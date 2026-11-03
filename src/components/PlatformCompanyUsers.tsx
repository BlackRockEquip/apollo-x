"use client";

/* eslint-disable react-hooks/set-state-in-effect -- the users are loaded from the server when the tab is shown */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, KeyRound, Lock, MoreHorizontal, Plus, Search, ShieldAlert, Trash2, X } from "lucide-react";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { allModuleKeys, filterUsers, missingTiles, moduleSummary, tileIsLocked, tileIsOn, toggleTile, userInitials, userStatus, type TileOption } from "@/lib/users/module-tiles";

// 2026-11-03, user request: "under platform admin, inside a company where I add users, it should allow me to manage users from this
// screen, not tell me to enter the company users page" (mockup "Platform company view mockup", Users tab + Edit user drawer).
// Lists the company's users and adds, edits, signs out and removes them in a side panel, without a support session
// (/api/v1/platform/companies/:id/users, lib/platform/company-users-service.ts).

type UserRow = { id: string; email: string; displayName: string; active: boolean; membershipStatus: string; role: string; roleLabel: string; moduleKeys: string[]; moduleLabels: string[] };
type EditorPayload = {
  availableModules: Array<{ moduleKey: string; label: string; category: string }>;
  tiles?: TileOption[];
  roles: Array<{ role: string; label: string }>;
  editor: null | { membershipId: string; email: string; displayName: string; role: string; active: boolean; membershipStatus: string; selectedModuleKeys: string[] };
};
type Form = { email: string; displayName: string; role: string; password: string; active: boolean; membershipStatus: string; selectedModuleKeys: string[] };

const AVATAR_TINTS = ["#fbf1d6", "#e6eefb", "#e3f5f1", "#f3e8fb", "#fde9e2", "#eef1f6"];
const tintFor = (text: string) => AVATAR_TINTS[Array.from(text).reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % AVATAR_TINTS.length];

async function readJson(response: Response) {
  try { return await response.json(); } catch { return {}; }
}

export function PlatformCompanyUsers({ companyId, companyActive, onCount }: { companyId: string; companyActive: boolean; onCount?: (count: number) => void }) {
  const base = `/api/v1/platform/companies/${encodeURIComponent(companyId)}/users`;
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [seed, setSeed] = useState<EditorPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // The side panel: null = closed; "new" = adding; otherwise the membership being edited.
  const [panel, setPanel] = useState<null | "new" | string>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [panelError, setPanelError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(base, { cache: "no-store" });
      const body = await readJson(response);
      if (!response.ok) throw new Error(body.error?.message || "Unable to load the users.");
      setUsers(body.users as UserRow[]);
      setSeed(body.editor as EditorPayload);
      onCount?.((body.users as UserRow[]).length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load the users.");
    } finally {
      setLoading(false);
    }
  }, [base, onCount]);

  useEffect(() => { void load(); }, [load]);

  const tiles = useMemo(() => seed?.tiles ?? [], [seed]);
  const totalModules = useMemo(() => new Set(tiles.flatMap((tile) => tile.controllable)).size || (seed?.availableModules.length ?? 0), [tiles, seed]);
  const visible = useMemo(() => filterUsers(users, { search, role: roleFilter, status: statusFilter }), [users, search, roleFilter, statusFilter]);
  const adminCount = users.filter((u) => u.role === "COMPANY_ADMIN" && userStatus(u) === "active").length;

  function openNew() {
    if (!seed) return;
    const roles = seed.roles.map((r) => r.role);
    setForm({ email: "", displayName: "", role: roles.includes("COMPANY_ADMIN") ? "COMPANY_ADMIN" : (roles[0] ?? "USER"), password: "", active: true, membershipStatus: "ACTIVE", selectedModuleKeys: allModuleKeys(tiles, seed.availableModules) });
    setPanelError(""); setNotice(""); setMenuFor(null);
    setPanel("new");
  }

  async function openEdit(user: UserRow) {
    setMenuFor(null); setNotice(""); setError(""); setPanelError("");
    setBusy(true);
    try {
      const response = await fetch(`${base}/${encodeURIComponent(user.id)}`, { cache: "no-store" });
      const body = (await readJson(response)) as EditorPayload & { error?: { message?: string } };
      if (!response.ok || !body.editor) throw new Error(body.error?.message || "Unable to load this user.");
      setSeed(body); // the tiles now carry what is saved for this user
      setForm({ email: body.editor.email, displayName: body.editor.displayName, role: body.editor.role, password: "", active: body.editor.active, membershipStatus: body.editor.membershipStatus, selectedModuleKeys: body.editor.selectedModuleKeys });
      setPanel(user.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load this user.");
    } finally {
      setBusy(false);
    }
  }

  function closePanel() { setPanel(null); setForm(null); setPanelError(""); }

  useEffect(() => {
    if (!panel) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") closePanel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel]);

  const editing = panel && panel !== "new" ? users.find((u) => u.id === panel) ?? null : null;
  const canSave = !!form && form.displayName.trim().length >= 2 && (panel !== "new" || (form.email.trim().length >= 5 && form.password.length >= 8)) && (form.password === "" || form.password.length >= 8);

  async function save() {
    if (!form || !panel) return;
    setBusy(true); setPanelError("");
    try {
      const adding = panel === "new";
      const payload = adding
        ? { email: form.email.trim(), displayName: form.displayName.trim(), password: form.password, role: form.role, active: form.active, moduleKeys: form.selectedModuleKeys }
        : { displayName: form.displayName.trim(), password: form.password, role: form.role, active: form.active, membershipStatus: form.membershipStatus, moduleKeys: form.selectedModuleKeys };
      const response = await fetch(adding ? base : `${base}/${encodeURIComponent(panel)}`, { method: adding ? "POST" : "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await readJson(response);
      if (!response.ok) throw new Error(body.error?.message || "Unable to save the user.");
      setNotice(adding ? `${form.displayName.trim()} was added.` : `${form.displayName.trim()} was updated.`);
      closePanel();
      await load();
    } catch (e) {
      setPanelError(e instanceof Error ? e.message : "Unable to save the user.");
    } finally {
      setBusy(false);
    }
  }

  async function signOutEverywhere(user: UserRow) {
    setMenuFor(null);
    if (!(await confirm({ message: `Sign ${user.displayName} out of this company? They will need to sign in again.`, tone: "warning", confirmLabel: "Sign out" }))) return;
    setBusy(true); setError(""); setNotice(""); setPanelError("");
    try {
      const response = await fetch(`${base}/${encodeURIComponent(user.id)}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const body = await readJson(response);
      if (!response.ok) throw new Error(body.error?.message || "Unable to sign the user out.");
      setNotice(`${user.displayName} was signed out and will need to sign in again.`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unable to sign the user out.";
      if (panel) setPanelError(message); else setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function removeUser(user: UserRow) {
    setMenuFor(null);
    if (!(await confirm({ message: `Remove ${user.displayName} (${user.email}) from this company? They lose access straight away. Their name stays on past jobs and history.`, tone: "danger", confirmLabel: "Remove" }))) return;
    setBusy(true); setError(""); setNotice(""); setPanelError("");
    try {
      const response = await fetch(`${base}/${encodeURIComponent(user.id)}`, { method: "DELETE" });
      const body = await readJson(response);
      if (!response.ok) throw new Error(body.error?.message || "Unable to remove the user.");
      if (panel === user.id) closePanel();
      setNotice(`${user.displayName} was removed.`);
      await load();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unable to remove the user.";
      if (panel) setPanelError(message); else setError(message);
    } finally {
      setBusy(false);
    }
  }

  const update = (patch: Partial<Form>) => setForm((current) => (current ? { ...current, ...patch } : current));
  const selected = form?.selectedModuleKeys ?? [];
  const onCount2 = tiles.filter((tile) => !tileIsLocked(tile) && tileIsOn(tile, selected)).length;
  const switchable = tiles.filter((tile) => !tileIsLocked(tile)).length;

  return (
    <section className="pcu">
      <div className="pcu-toolbar">
        <label className="pcu-search"><Search size={15} aria-hidden="true" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email" aria-label="Search users" /></label>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filter by role">
          <option value="">All roles</option>
          {(seed?.roles ?? []).map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>
        <div className="pcu-toolbar-end">
          <span className="pcu-count">{users.length} {users.length === 1 ? "user" : "users"} · {adminCount} company {adminCount === 1 ? "admin" : "admins"}</span>
          <button type="button" className="gold-button" onClick={openNew} disabled={!companyActive || !seed || loading} title={companyActive ? "" : "Users cannot be added while the company is deactivated"}><Plus size={15} /> Add user</button>
        </div>
      </div>

      {error ? <div className="inline-error pcu-banner">{error}</div> : null}
      {notice ? <div className="inline-success pcu-banner">{notice}</div> : null}
      {!companyActive ? <div className="platform-inline-note pcu-banner">This company is deactivated, so its users can be looked at but not changed.</div> : null}

      <div className="pcu-head" role="row"><div>User</div><div>Role</div><div>Module access</div><div>Status</div><div className="pcu-right">Actions</div></div>
      <div className="pcu-body">
        {loading && users.length === 0 ? <div className="pcu-empty">Loading the users…</div> : null}
        {!loading && users.length === 0 ? <div className="pcu-empty">No users on this company yet. Use <b>Add user</b> to create the first login.</div> : null}
        {!loading && users.length > 0 && visible.length === 0 ? <div className="pcu-empty">No user matches that search.</div> : null}
        {visible.map((user) => {
          const status = userStatus(user);
          return (
            <div key={user.id} className="pcu-row" role="row">
              <div className="pcu-user">
                <span className="pcu-avatar" style={{ background: tintFor(user.email) }} aria-hidden="true">{userInitials(user.displayName)}</span>
                <span className="pcu-user-text"><strong>{user.displayName}</strong><small>{user.email}</small></span>
              </div>
              <div><span className="pcu-pill pcu-role">{user.roleLabel || user.role}</span></div>
              <div className="pcu-modules" title={user.moduleLabels.join(", ")}>{moduleSummary(user.moduleKeys.length, totalModules)}</div>
              <div><span className={status === "active" ? "pcu-pill pcu-ok" : "pcu-pill pcu-off"}>{status === "active" ? "Active" : user.active ? user.membershipStatus.charAt(0) + user.membershipStatus.slice(1).toLowerCase() : "Sign-in off"}</span></div>
              <div className="pcu-actions">
                <button type="button" className="quiet-button" onClick={() => void openEdit(user)} disabled={busy}>{companyActive ? "Edit" : "View"}</button>
                {companyActive ? (
                  <div className="pcu-menu-wrap">
                    <button type="button" className="pcu-more" aria-label={`More actions for ${user.displayName}`} aria-haspopup="menu" aria-expanded={menuFor === user.id} onClick={() => setMenuFor(menuFor === user.id ? null : user.id)}><MoreHorizontal size={16} /></button>
                    {menuFor === user.id ? (
                      <>
                        <div className="pcu-menu-scrim" onClick={() => setMenuFor(null)} />
                        <div className="pcu-menu" role="menu">
                          <button type="button" role="menuitem" onClick={() => void signOutEverywhere(user)}><KeyRound size={14} /> Sign out everywhere</button>
                          <button type="button" role="menuitem" className="danger" onClick={() => void removeUser(user)}><Trash2 size={14} /> Remove from company</button>
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <div className="pcu-foot"><ShieldAlert size={14} /> Changes made here are recorded in the company&rsquo;s audit log as platform actions. No support session is needed.</div>

      {panel && form && seed ? (
        <div className="pcu-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closePanel(); }}>
          <aside className="pcu-panel" role="dialog" aria-modal="true" aria-label={panel === "new" ? "Add user" : "Edit user"}>
            <header className="pcu-panel-head">
              <div className="pcu-panel-who">
                <span className="pcu-avatar big" style={{ background: tintFor(form.email || form.displayName) }} aria-hidden="true">{userInitials(form.displayName || "New user")}</span>
                <div>
                  <p className="eyebrow">{panel === "new" ? "Add user" : companyActive ? "Edit user" : "User"}</p>
                  <h2>{panel === "new" ? (form.displayName.trim() || "New user") : form.displayName}</h2>
                  {panel !== "new" ? <small>{form.email}</small> : null}
                </div>
              </div>
              <button type="button" className="pcu-close" onClick={closePanel} aria-label="Close"><X size={16} /></button>
            </header>

            <div className="pcu-panel-body">
              {panelError ? <div className="inline-error">{panelError}</div> : null}
              <fieldset disabled={!companyActive || busy} className="pcu-fields">
                <label><span>Name</span><input value={form.displayName} onChange={(e) => update({ displayName: e.target.value })} autoComplete="off" /></label>
                <label><span>Role</span>
                  <select value={form.role} onChange={(e) => update({ role: e.target.value })}>{seed.roles.map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}</select>
                </label>
                {panel === "new" ? <label className="wide"><span>Email</span><input type="email" value={form.email} onChange={(e) => update({ email: e.target.value })} autoComplete="off" /></label> : null}
                <label className="wide"><span>{panel === "new" ? "Password" : "New password"} {panel === "new" ? <em>(at least 8 characters)</em> : <em>(leave blank to keep the current one)</em>}</span>
                  <input type="password" value={form.password} onChange={(e) => update({ password: e.target.value })} autoComplete="new-password" />
                </label>
                <div className="pcu-switch-row wide">
                  <div><b>Can sign in</b><small>Switch off to stop this person using the company without removing them.</small></div>
                  <button type="button" role="switch" aria-checked={form.active} aria-label="Can sign in" className={form.active ? "pcu-switch on" : "pcu-switch"} onClick={() => update({ active: !form.active })}><i /></button>
                </div>
                {panel !== "new" ? (
                  <label className="wide"><span>Membership status</span>
                    <select value={form.membershipStatus} onChange={(e) => update({ membershipStatus: e.target.value })}>
                      <option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="ENDED">Ended</option>
                    </select>
                  </label>
                ) : null}
              </fieldset>

              <div className="pcu-mod-head">
                <div><h3>Module access</h3><p>Same tiles as the company&rsquo;s Industry build. The company licence still decides what can be used.</p></div>
                <div className="pcu-mod-tools">
                  <span>{onCount2} of {switchable} on</span>
                  <button type="button" className="quiet-button" disabled={!companyActive || busy} onClick={() => update({ selectedModuleKeys: allModuleKeys(tiles, seed.availableModules) })}>All</button>
                  <button type="button" className="quiet-button" disabled={!companyActive || busy} onClick={() => update({ selectedModuleKeys: [] })}>None</button>
                </div>
              </div>
              {tiles.length === 0 ? <p className="pcu-empty-small">No modules are enabled for this company yet.</p> : (
                <div className="pcu-tiles">
                  {tiles.map((tile) => {
                    const locked = tileIsLocked(tile);
                    const on = locked ? true : tileIsOn(tile, selected);
                    const missing = on && !locked ? missingTiles(tile, tiles, selected) : [];
                    return (
                      <button key={tile.id} type="button" className={`pcu-tile${on ? " on" : ""}${locked ? " locked" : ""}`} disabled={locked || !companyActive || busy} aria-pressed={on} onClick={() => update({ selectedModuleKeys: toggleTile(tile, selected) })}>
                        <span className="pcu-tile-box">{locked ? <Lock size={11} /> : on ? <Check size={13} strokeWidth={3} /> : null}</span>
                        <span className="pcu-tile-text">
                          <b>{tile.label}</b>
                          <small>{tile.note}</small>
                          <em>{locked ? "Included - follows the company licence" : on ? (missing.length > 0 ? "Switched on, but not working" : "Access") : "No access"}{tile.licensed === false ? " · not in company licence" : ""}</em>
                          {tile.state && panel !== "new" && !tile.state.working ? <small className="warn">Saved for this user: not working - {tile.state.reason}</small> : null}
                          {missing.length > 0 ? <small className="warn">Needs {missing.map((t) => t.label).join(" and ")} switched on as well.</small> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {editing && companyActive ? (
                <div className="pcu-danger">
                  <b>Account actions</b>
                  <div>
                    <button type="button" className="quiet-button" disabled={busy} onClick={() => void signOutEverywhere(editing)}><KeyRound size={14} /> Sign out everywhere</button>
                    <button type="button" className="quiet-button pcu-remove" disabled={busy} onClick={() => void removeUser(editing)}><Trash2 size={14} /> Remove from this company</button>
                  </div>
                  <small>Removing keeps their name on past jobs and history. The last company administrator cannot be removed.</small>
                </div>
              ) : null}
            </div>

            <footer className="pcu-panel-foot">
              <button type="button" className="quiet-button" onClick={closePanel}>{companyActive ? "Cancel" : "Close"}</button>
              {companyActive ? <button type="button" className="gold-button" disabled={!canSave || busy} onClick={() => void save()}>{busy ? "Saving…" : panel === "new" ? "Add user" : "Save changes"}</button> : null}
            </footer>
          </aside>
        </div>
      ) : null}
      {confirmDialog}
    </section>
  );
}
