import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantPageAccess } from "@/lib/auth/page-guard";
import { canManageCompanyUsers } from "@/lib/users/access";
import { SettingsTabNav } from "@/components/SettingsTabNav";
import { UsersWorkspace } from "@/components/UsersWorkspace";

export default async function Page() {
  const ctx = await requireRequestContext();
  requireTenantPageAccess(ctx, "USERS_MANAGE");
  // System users are managed by Flo X platform admins only (read-write support session); company admins see User Setup only.
  const canManageUsers = canManageCompanyUsers(ctx);
  return <div>
    <header className="page-header compact"><div><p className="eyebrow">Settings</p><h1>{canManageUsers ? "Users" : "User Setup"}</h1><p>{canManageUsers ? "Managed by Flo X platform support for this company." : "Set up your mechanics/machinists and sales representatives. To add or change system users, contact Flo X."}</p></div></header>
    <SettingsTabNav ctx={ctx} current="users" />
    <UsersWorkspace canManageUsers={canManageUsers} />
  </div>;
}
