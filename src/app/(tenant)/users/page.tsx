import { requireRequestContext } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { requireTenantPageAccess } from "@/lib/auth/page-guard";
import { canManageCompanyUsers } from "@/lib/users/access";
import { SettingsTabNav } from "@/components/SettingsTabNav";
import { UsersWorkspace } from "@/components/UsersWorkspace";

export default async function Page() {
  const ctx = await requireRequestContext();
  requireTenantPageAccess(ctx, "USERS_MANAGE");
  // Users are managed by Flo X platform admins only (inside a read-write support session) - company admins are sent back.
  if (!canManageCompanyUsers(ctx)) redirect("/dashboard");
  return <div>
    <header className="page-header compact"><div><p className="eyebrow">Settings</p><h1>Users</h1><p>Managed by Flo X platform support for this company.</p></div></header>
    <SettingsTabNav ctx={ctx} current="users" />
    <UsersWorkspace />
  </div>;
}
