"use client";

/* eslint-disable react-hooks/set-state-in-effect -- async platform user loading intentionally mirrors existing workspace patterns */
import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus, Search } from "lucide-react";
import { PlatformRole, type TenantRole } from "@prisma/client";
import { PLATFORM_ROLE_LABELS, TENANT_ROLE_LABELS } from "@/lib/constants";

// 2026-09-22, user request (verbatim):
// "Platform Users menu
// -- make users displayed in table form (Name, User Name, Email, Status, Role)
// -- make users editable which allows you to change user role, email etc
// -- make sure no organization admin, user etc can be a platform administrator"
//
// Replaces the old app/platform/users/page.tsx (a server component posting
// to two "use server" actions with no way to show an error inline besides
// a full Next.js error page) with a client table matching every other
// sizable admin screen in this app (UsersWorkspace, PlatformModulesWorkspace).
//
// Note on columns: the request lists "Name, User Name, Email, Status,
// Role." Apollo X has no separate username field anywhere — the sign-in
// identifier for every account (platform or tenant) is the email address
// itself (see UserIdentity in schema.prisma: email is the only unique
// identity column). So "User Name" and "Email" would show the exact same
// value twice; this table has one Email column instead of two identical
// ones. If a real, separate login-username (distinct from email) is
// wanted, that's a bigger schema change than this table — flagging it
// rather than guessing.
type RoleAssignment = { assignmentId: string; role: PlatformRole; active: boolean; effectivePermissions: string[] };
type PlatformUser = {
  id: string;
  displayName: string;
  email: string;
  active: boolean;
  createdAt: string;
  roles: RoleAssignment[];
  effectivePermissions: string[];
  hasActiveCompanyMembership: boolean;
  // 2026-10-27, user request: group by company. One entry per active company membership.
  companies: { companyId: string; name: string; code: string; role: TenantRole }[];
};
type UserGroup = { key: string; name: string; sub: string; staff: boolean; rows: { user: PlatformUser; companyId: string | null; companyRole: TenantRole | null }[] };
const STAFF_KEY = "__staff";

const ROLE_OPTIONS = Object.values(PlatformRole);

export function PlatformUsersWorkspace() {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState({ displayName: "", email: "", active: true });
  const [newRole, setNewRole] = useState<PlatformRole>(PlatformRole.SUPPORT_READ_ONLY);
  const [grantEmail, setGrantEmail] = useState("");
  const [grantName, setGrantName] = useState("");
  const [grantPassword, setGrantPassword] = useState("");
  const [grantRole, setGrantRole] = useState<PlatformRole>(PlatformRole.SUPPORT_READ_ONLY);
  const [saving, setSaving] = useState(false);
  // 2026-10-27, user request: "Platform users, group by company for easier searching". Default view is grouped by company
  // (people with no company - Flo X staff - first); a flat list stays available. While a search is typed every group opens.
  const [view, setView] = useState<"company" | "flat">("company");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/v1/platform/users", { cache: "no-store" });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to load platform users.");
      setUsers(b);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load platform users.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((u) => u.displayName.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle));
  }, [users, q]);

  const groups = useMemo<UserGroup[]>(() => {
    const map = new Map<string, UserGroup>();
    const staff: UserGroup = { key: STAFF_KEY, name: "Flo X platform staff", sub: "People who are not members of a company", staff: true, rows: [] };
    map.set(STAFF_KEY, staff);
    for (const user of filtered) {
      if (user.companies.length === 0) { staff.rows.push({ user, companyId: null, companyRole: null }); continue; }
      for (const c of user.companies) {
        let group = map.get(c.companyId);
        if (!group) { group = { key: c.companyId, name: c.name, sub: c.code, staff: false, rows: [] }; map.set(c.companyId, group); }
        group.rows.push({ user, companyId: c.companyId, companyRole: c.role });
      }
    }
    const list = Array.from(map.values()).filter((g) => g.rows.length > 0);
    list.sort((a, b) => (a.staff === b.staff ? a.name.localeCompare(b.name) : a.staff ? -1 : 1));
    return list;
  }, [filtered]);
  const searching = q.trim().length > 0;
  const isOpen = (g: UserGroup) => (searching ? true : openGroups[g.key] ?? g.staff);
  const toggleGroup = (g: UserGroup) => setOpenGroups((cur) => ({ ...cur, [g.key]: !isOpen(g) }));
  const setAllGroups = (open: boolean) => setOpenGroups(Object.fromEntries(groups.map((g) => [g.key, open])));

  function startEdit(user: PlatformUser) {
    setEditingUserId(user.id);
    setProfileForm({ displayName: user.displayName, email: user.email, active: user.active });
    setNewRole(PlatformRole.SUPPORT_READ_ONLY);
    setError(""); setNotice("");
  }
  function cancelEdit() { setEditingUserId(null); }

  async function saveProfile(userId: string) {
    setSaving(true); setError(""); setNotice("");
    try {
      const r = await fetch(`/api/v1/platform/users/${userId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(profileForm) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to update user.");
      setNotice("User updated.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update user.");
    } finally {
      setSaving(false);
    }
  }

  async function updateRole(assignmentId: string, role: PlatformRole, active: boolean) {
    setError(""); setNotice("");
    try {
      const r = await fetch(`/api/v1/platform/users/authority/${assignmentId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ role, active }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to update platform role.");
      setNotice("Platform role updated.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update platform role.");
    }
  }

  async function addRole(email: string, role: PlatformRole) {
    setError(""); setNotice("");
    try {
      const r = await fetch("/api/v1/platform/users/authority", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, role }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to grant platform role.");
      setNotice("Platform role granted.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to grant platform role.");
    }
  }

  async function grantNew() {
    setSaving(true); setError(""); setNotice("");
    try {
      const r = await fetch("/api/v1/platform/users/authority", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: grantEmail, role: grantRole, displayName: grantName, password: grantPassword }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to grant platform authority.");
      setNotice("Platform user added.");
      setGrantEmail(""); setGrantName(""); setGrantPassword("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to grant platform authority.");
    } finally {
      setSaving(false);
    }
  }

  // One user's table row plus (when open) the inline editor. companyRole = their role in the group's company, when grouped.
  function userRows(user: PlatformUser, companyRole: TenantRole | null, cols: number) {
    return (
                <Fragment key={`${user.id}:${companyRole ?? "-"}`}>
                  <tr>
                    <td><strong>{user.displayName}</strong>{user.hasActiveCompanyMembership ? <div className="muted small-line">Org member</div> : null}</td>
                    {cols === 6 ? <td>{user.companies.length === 0 ? <span className="muted small-line">Flo X staff</span> : user.companies.map((c) => c.name).join(", ")}</td> : null}
                    <td>{user.email}</td>
                    <td><span className={user.active ? "status-pill" : "status-pill neutral"}>{user.active ? "Active" : "Inactive"}</span></td>
                    <td>
                      <div className="stack-grid">
                        {companyRole ? <span className="status-pill neutral">{TENANT_ROLE_LABELS[companyRole]}</span> : null}
                        {user.roles.map((role) => <span key={role.assignmentId} className={role.active ? "status-pill" : "status-pill neutral"}>{PLATFORM_ROLE_LABELS[role.role]}</span>)}
                        {!companyRole && user.roles.length === 0 ? <span className="muted small-line">{cols === 6 && user.companies.length > 0 ? user.companies.map((c) => TENANT_ROLE_LABELS[c.role]).join(", ") : "No platform roles"}</span> : null}
                      </div>
                    </td>
                    <td className="actions">
                      <button type="button" className="table-action" onClick={() => (editingUserId === user.id ? cancelEdit() : startEdit(user))}><Pencil size={13} /> {editingUserId === user.id ? "Close" : "Edit"}</button>
                    </td>
                  </tr>
                  {editingUserId === user.id ? (
                    <tr>
                      <td colSpan={cols}>
                        <div className="drawer-fields compact-form-fields">
                          <label><span>Name</span><input value={profileForm.displayName} onChange={(e) => setProfileForm((f) => ({ ...f, displayName: e.target.value }))} /></label>
                          <label><span>Email</span><input type="email" value={profileForm.email} onChange={(e) => setProfileForm((f) => ({ ...f, email: e.target.value }))} /></label>
                          <label><span>Account status</span><select value={profileForm.active ? "true" : "false"} onChange={(e) => setProfileForm((f) => ({ ...f, active: e.target.value === "true" }))}><option value="true">Active</option><option value="false">Inactive</option></select></label>
                          <div className="platform-form-actions">
                            <button type="button" className="quiet-button" onClick={cancelEdit}>Cancel</button>
                            <button type="button" className="gold-button" disabled={saving} onClick={() => void saveProfile(user.id)}>Save</button>
                          </div>
                        </div>

                        {user.hasActiveCompanyMembership ? (
                          <div className="inline-error" style={{ marginTop: 10 }}>
                            This person is an active member of a company (an organization admin or user). Platform roles can be disabled for them below, but no new or reactivated platform role can be granted while they remain an active company member.
                          </div>
                        ) : null}

                        {user.roles.length > 0 ? (
                          <div className="platform-role-grid compact-top-gap">
                            {user.roles.map((role) => (
                              <div key={role.assignmentId} className="platform-form-grid role-assignment-form">
                                <label><span>Role</span><select defaultValue={role.role} onChange={(e) => void updateRole(role.assignmentId, e.target.value as PlatformRole, role.active)}>{ROLE_OPTIONS.map((value) => <option key={value} value={value}>{PLATFORM_ROLE_LABELS[value]}</option>)}</select></label>
                                <label><span>Status</span>
                                  <select defaultValue={role.active ? "true" : "false"} onChange={(e) => void updateRole(role.assignmentId, role.role, e.target.value === "true")} disabled={!role.active && user.hasActiveCompanyMembership}>
                                    <option value="true">Active</option>
                                    <option value="false">Inactive</option>
                                  </select>
                                </label>
                              </div>
                            ))}
                          </div>
                        ) : null}

                        <div className="platform-form-grid compact-top-gap">
                          <label><span>Add role</span><select value={newRole} onChange={(e) => setNewRole(e.target.value as PlatformRole)}>{ROLE_OPTIONS.map((value) => <option key={value} value={value}>{PLATFORM_ROLE_LABELS[value]}</option>)}</select></label>
                          <div className="platform-form-actions">
                            <button type="button" className="quiet-button" disabled={user.hasActiveCompanyMembership} onClick={() => void addRole(user.email, newRole)}><Plus size={13} /> Grant this role</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
    );
  }

  return (
    <>
      <section className="platform-grid">
        <article className="platform-card">
          <h3>Add platform user</h3>
          <p className="muted small-line">Enter the person&apos;s name, email and a starting password to create their login with the platform role. If they already have a login, just enter their email and role.</p>
          <div className="platform-form-grid">
            <label><span>Name</span><input value={grantName} autoComplete="off" placeholder="Full name" onChange={(e) => setGrantName(e.target.value)} /></label>
            <label><span>Email</span><input type="email" required autoComplete="off" placeholder="operator@example.com" value={grantEmail} onChange={(e) => setGrantEmail(e.target.value)} /></label>
            <label><span>Starting password</span><input type="password" autoComplete="new-password" placeholder="At least 8 characters" value={grantPassword} onChange={(e) => setGrantPassword(e.target.value)} /></label>
            <label><span>Role</span><select value={grantRole} onChange={(e) => setGrantRole(e.target.value as PlatformRole)}>{ROLE_OPTIONS.map((role) => <option key={role} value={role}>{PLATFORM_ROLE_LABELS[role]}</option>)}</select></label>
            <div className="platform-form-actions wide"><button type="button" className="primary-button" disabled={saving || !grantEmail.trim()} onClick={() => void grantNew()}>Add platform user</button></div>
          </div>
        </article>
        <article className="platform-card">
          <h3>Authority safeguards</h3>
          <ul className="platform-bullet-list">
            <li>Platform authority does not create tenant membership.</li>
            <li>Platform authority does not grant tenant operational access without explicit support context.</li>
            <li>Role changes revoke active sessions so stale platform authority is not reused.</li>
            <li>Last usable platform administrator protection prevents accidental lockout.</li>
            <li>A person who already belongs to a company (an active organization admin or user) can&apos;t be granted or reactivated into platform authority — flagged below as &quot;Org member&quot;.</li>
          </ul>
        </article>
      </section>

      {error ? <div className="inline-error">{error}</div> : null}
      {notice ? <div className="inline-success">{notice}</div> : null}

      <section className="master-panel platform-panel">
        <div className="master-toolbar jobs-toolbar">
          <label className="search-control inventory-search-control"><Search size={15} /><input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search platform user by name or email" /></label>
          <span>{filtered.length} platform user{filtered.length === 1 ? "" : "s"}</span>
        </div>
      </section>

      <section className="master-panel platform-panel">
        <div className="master-toolbar jobs-toolbar">
          <div className="tab-strip" role="group" aria-label="View">
            <button type="button" className={view === "company" ? "active" : ""} onClick={() => setView("company")}>By company</button>
            <button type="button" className={view === "flat" ? "active" : ""} onClick={() => setView("flat")}>Flat list</button>
          </div>
          {view === "company" && !searching ? (
            <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button type="button" className="quiet-button" onClick={() => setAllGroups(true)}>Expand all</button>
              <button type="button" className="quiet-button" onClick={() => setAllGroups(false)}>Collapse all</button>
            </span>
          ) : null}
        </div>
      </section>

      {loading && users.length === 0 ? <section className="detail-panel"><div className="table-state compact-empty-state">Loading…</div></section> : null}
      {!loading && filtered.length === 0 ? <section className="detail-panel"><div className="table-state compact-empty-state">No users match this search.</div></section> : null}

      {view === "company" ? groups.map((g) => {
        const open = isOpen(g);
        const active = g.rows.filter((r) => r.user.active).length;
        return (
          <section className="detail-panel pu-group" key={g.key}>
            <button type="button" className="pu-group-head" aria-expanded={open} onClick={() => toggleGroup(g)}>
              {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <span className="pu-group-name"><strong>{g.name}</strong><small>{g.sub}</small></span>
              <span className="muted small-line">{g.rows.length} user{g.rows.length === 1 ? "" : "s"}, {active} active</span>
            </button>
            {open ? (
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Role</th><th></th></tr></thead>
                  <tbody>{g.rows.map((r) => userRows(r.user, r.companyRole, 5))}</tbody>
                </table>
              </div>
            ) : null}
          </section>
        );
      }) : null}

      {view === "flat" && filtered.length > 0 ? (
        <section className="detail-panel">
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>Name</th><th>Company</th><th>Email</th><th>Status</th><th>Role</th><th></th></tr></thead>
              <tbody>{filtered.map((user) => userRows(user, null, 6))}</tbody>
            </table>
          </div>
        </section>
      ) : null}
      <style>{`
.pu-group{padding:0;overflow:hidden}
.pu-group-head{display:flex;width:100%;align-items:center;gap:10px;padding:12px 16px;border:0;background:transparent;cursor:pointer;text-align:left;font:inherit;color:inherit}
.pu-group-head:hover{background:var(--ink-50,#f4f6fa)}
.pu-group-name{display:grid;flex:1;min-width:0}.pu-group-name small{color:var(--ink-500);font-size:11.5px}
`}</style>
    </>
  );
}
