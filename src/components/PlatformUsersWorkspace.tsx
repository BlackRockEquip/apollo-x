"use client";

/* eslint-disable react-hooks/set-state-in-effect -- async platform user loading intentionally mirrors existing workspace patterns */
import { Fragment, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Search } from "lucide-react";
import { PlatformRole } from "@prisma/client";
import { PLATFORM_ROLE_LABELS } from "@/lib/constants";

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
};

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
  const [grantRole, setGrantRole] = useState<PlatformRole>(PlatformRole.SUPPORT_READ_ONLY);
  const [saving, setSaving] = useState(false);

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
      const r = await fetch("/api/v1/platform/users/authority", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: grantEmail, role: grantRole }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to grant platform authority.");
      setNotice("Platform authority granted.");
      setGrantEmail("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to grant platform authority.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="platform-grid">
        <article className="platform-card">
          <h3>Grant platform role</h3>
          <div className="platform-form-grid">
            <label><span>User email</span><input type="email" required placeholder="operator@example.com" value={grantEmail} onChange={(e) => setGrantEmail(e.target.value)} /></label>
            <label><span>Role</span><select value={grantRole} onChange={(e) => setGrantRole(e.target.value as PlatformRole)}>{ROLE_OPTIONS.map((role) => <option key={role} value={role}>{PLATFORM_ROLE_LABELS[role]}</option>)}</select></label>
            <div className="platform-form-actions wide"><button type="button" className="primary-button" disabled={saving || !grantEmail.trim()} onClick={() => void grantNew()}>Grant platform authority</button></div>
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

      <section className="detail-panel">
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Role</th><th></th></tr></thead>
            <tbody>
              {filtered.map((user) => (
                <Fragment key={user.id}>
                  <tr>
                    <td><strong>{user.displayName}</strong>{user.hasActiveCompanyMembership ? <div className="muted small-line">Org member</div> : null}</td>
                    <td>{user.email}</td>
                    <td><span className={user.active ? "status-pill" : "status-pill neutral"}>{user.active ? "Active" : "Inactive"}</span></td>
                    <td>
                      {user.roles.length === 0
                        ? <span className="muted small-line">No platform roles</span>
                        : <div className="stack-grid">{user.roles.map((role) => <span key={role.assignmentId} className={role.active ? "status-pill" : "status-pill neutral"}>{PLATFORM_ROLE_LABELS[role.role]}</span>)}</div>}
                    </td>
                    <td className="actions">
                      <button type="button" className="table-action" onClick={() => (editingUserId === user.id ? cancelEdit() : startEdit(user))}><Pencil size={13} /> {editingUserId === user.id ? "Close" : "Edit"}</button>
                    </td>
                  </tr>
                  {editingUserId === user.id ? (
                    <tr>
                      <td colSpan={5}>
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
              ))}
              {!loading && filtered.length === 0 && <tr><td colSpan={5} className="table-state compact-empty-state">No platform users match this filter.</td></tr>}
              {loading && <tr><td colSpan={5} className="table-state compact-empty-state">Loading…</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
