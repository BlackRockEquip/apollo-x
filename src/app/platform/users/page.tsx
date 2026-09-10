import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { PlatformRole } from "@prisma/client";
import { getRequestContext } from "@/lib/auth/session";
import { requirePlatformPermission } from "@/lib/auth/guards";
import { PLATFORM_ROLE_LABELS } from "@/lib/constants";
import { createPlatformAuthorityAction, updatePlatformAuthorityAction } from "@/app/platform/actions";
import { listPlatformUsers } from "@/lib/platform/admin-service";

export const dynamic = "force-dynamic";

export default async function PlatformUsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getRequestContext();
  if (!context) redirect("/login");
  if (context.companyId) redirect("/dashboard");
  requirePlatformPermission(context, "PLATFORM_OPERATORS_MANAGE");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const users = await listPlatformUsers(context, { q });

  return (
    <>
      <section className="platform-grid">
        <article className="platform-card">
          <h3>Grant platform role</h3>
          <form action={createPlatformAuthorityAction} className="platform-form-grid">
            <label><span>User email</span><input name="email" type="email" required placeholder="operator@example.com" /></label>
            <label><span>Role</span><select name="role" defaultValue={PlatformRole.SUPPORT_READ_ONLY}>{Object.values(PlatformRole).map((role) => <option key={role} value={role}>{PLATFORM_ROLE_LABELS[role]}</option>)}</select></label>
            <div className="platform-form-actions wide"><button type="submit" className="primary-button">Grant platform authority</button></div>
          </form>
        </article>
        <article className="platform-card">
          <h3>Authority safeguards</h3>
          <ul className="platform-bullet-list">
            <li>Platform authority does not create tenant membership.</li>
            <li>Platform authority does not grant tenant operational access without explicit support context.</li>
            <li>Role changes revoke active sessions so stale platform authority is not reused.</li>
            <li>Last usable platform administrator protection prevents accidental lockout.</li>
          </ul>
        </article>
      </section>

      <section className="master-panel platform-panel">
        <div className="master-toolbar jobs-toolbar">
          <form id="platform-user-filter-form" method="GET" action="/platform/users" className="search-control inventory-search-control"><Search size={15} /><input type="text" name="q" placeholder="Search platform user by name or email" defaultValue={q} /></form>
          <button type="submit" form="platform-user-filter-form" className="quiet-button">Apply</button>
          <span>{users.length} platform user{users.length === 1 ? "" : "s"}</span>
        </div>
      </section>

      <section className="platform-user-list">
        {users.map((user) => (
          <article key={user.id} className="platform-card">
            <div className="platform-user-header">
              <div>
                <strong>{user.displayName}</strong>
                <p className="muted small-line">{user.email} · {user.active ? "Active" : "Inactive"} · Created {new Date(user.createdAt).toLocaleDateString("en-ZA")}</p>
              </div>
              <div className="stack-grid">
                {user.roles.length === 0 ? <span className="status-pill">No platform roles</span> : user.roles.map((role) => <span key={role.role} className="status-pill">{PLATFORM_ROLE_LABELS[role.role]}</span>)}
              </div>
            </div>
            <div className="platform-permission-list">
              {user.effectivePermissions.map((permission) => <span key={permission} className="status-chip">{permission}</span>)}
              {user.effectivePermissions.length === 0 && <span className="muted small-line">No effective platform permissions.</span>}
            </div>
            <div className="platform-role-grid compact-top-gap">
              {user.roles.map((role) => (
                <form key={role.assignmentId} action={updatePlatformAuthorityAction} className="platform-form-grid role-assignment-form">
                  <input type="hidden" name="assignmentId" value={role.assignmentId} />
                  <label><span>Role</span><select name="role" defaultValue={role.role}>{Object.values(PlatformRole).map((value) => <option key={value} value={value}>{PLATFORM_ROLE_LABELS[value]}</option>)}</select></label>
                  <label><span>Status</span><select name="active" defaultValue={role.active ? "true" : "false"}><option value="true">Active</option><option value="false">Inactive</option></select></label>
                  <div className="platform-form-actions"><button type="submit" className="quiet-button">Update authority</button></div>
                </form>
              ))}
            </div>
          </article>
        ))}
        {users.length === 0 && <p className="empty-state">No platform users match this filter.</p>}
      </section>
    </>
  );
}