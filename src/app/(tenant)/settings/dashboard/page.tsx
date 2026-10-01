import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantPageAccess } from "@/lib/auth/page-guard";
import { SettingsTabNav } from "@/components/SettingsTabNav";
import { DashboardSettingsWorkspace } from "@/components/DashboardSettingsWorkspace";

export default async function Page() {
  const ctx = await requireRequestContext();
  requireTenantPageAccess(ctx, "SETTINGS_MANAGE");
  return <div>
    <header className="page-header compact"><div><p className="eyebrow">Settings</p><h1>Dashboard</h1></div></header>
    <SettingsTabNav ctx={ctx} current="settings-dashboard" />
    <DashboardSettingsWorkspace />
  </div>;
}
