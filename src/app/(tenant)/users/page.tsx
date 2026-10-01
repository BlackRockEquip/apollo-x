import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantPageAccess } from "@/lib/auth/page-guard";
import { SettingsTabNav } from "@/components/SettingsTabNav";
import { UsersWorkspace } from "@/components/UsersWorkspace";

export default async function Page() {
  const ctx = await requireRequestContext();
  requireTenantPageAccess(ctx, "USERS_MANAGE");
  return <div>
    <header className="page-header compact"><div><p className="eyebrow">Settings</p><h1>Users</h1><p>Tenant-scoped access within current company entitlements only.</p></div></header>
    <SettingsTabNav ctx={ctx} current="users" />
    <UsersWorkspace />
  </div>;
}
